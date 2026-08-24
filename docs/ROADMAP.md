# Roadmap

Nineteen phases. Each one is explained, implemented, tested, built, security-reviewed,
and documented before the next begins. A phase with critical failures blocks the next.

> **Numbering.** This file counts the foundation as **Phase 0**, matching the original
> brief. The Master Knowledge Base v2.0 (§32) counts the same nineteen phases from
> **1**, so every v2.0 number is one higher: v2.0's "2. Database" is Phase 1 here, and
> v2.0's "17. Security" is Phase 16. The phases themselves are identical. This file's
> numbering is the one used by every cross-reference in `docs/`, `decisions/`, and source
> comments — renumbering would invalidate all of them, so the offset is documented
> instead.

| # | Phase | Status |
|---|---|---|
| 0 | Architecture, security model, schema design, infrastructure | **complete** |
| 1 | Railway PostgreSQL — provision, apply migrations | **complete** 2026-08-22 |
| 2 | Authentication — passkeys, OTP, sessions | **complete** — OTP, passkeys, sessions; proven end to end against production |
| 3 | Authorization, RBAC, multi-tenancy enforcement + isolation suites | **complete** — merged model (ADR-013); `tenant-isolation` 27/27, `caseload-scope` 17/17 |
| 4 | Service and repository layers | **complete** — 20 repositories, SQL confined to them (ADR-005) |
| 5 | Customer dashboard | **complete** — `/dashboard`, `/today`, `/progress`, `/notifications`, `/reports` |
| 6 | Yoga engine | **complete** — library, programmes, snapshot on assignment (ADR-009), `/admin/yoga` |
| 7 | Diet engine | **complete** — meals, plans, adherence, `/admin/diet` |
| 8 | Admin / consultant dashboard | **complete** — caseload, members, access requests, analytics, libraries |
| 9 | Owner dashboards — platform and organization | **complete** — `/super-admin` + `/super-admin/sign-in`; no separate Owner dashboard (ADR-013) |
| 10 | Notifications | **partial** — in-app works end to end. **No outbound email beyond OTP**, so an approved applicant is not actually reached |
| 11 | Reports + job queue drain | **partial** — job queue and cron drain built; **report generation not written**, so `reports` is empty and the repository reads only |
| 12 | ImageKit media | **code complete, NOT working in production** — `IMAGEKIT_PRIVATE_KEY` / `IMAGEKIT_URL_ENDPOINT` unset, so uploads fail. External dependency, not a code gap |
| 13 | Import / export | **partial** — import done (template, preview, transactional apply). **Export not built** |
| 14 | PWA install, icon set | **complete** — manifest, service worker, offline route, install |
| 15A | 3D engine and pose viewer | **complete** |
| 15B | Scroll-driven yoga journey | **complete** — `/experience/yoga` |
| 15C | Production 3D assets | **blocked — art dependency** |
| 15D | 3D performance and accessibility | **complete** — lazy, reduced-motion, no-WebGL fallback |
| 16 | Security hardening — CSP, rate limiting, dependency scanning | **partial** — CSP done (`2d7ac67`), auth rate limiting done. **No dependency scanning in CI** |
| 17 | Performance and accessibility | **partial** — lazy 3D, reduced motion, skip link, focus states. No measured budget |
| 18 | Production deployment | **partial** — live on Railway from `main`. **Any push deploys and migrates**; governance not yet enforced |

## Verified status — 2026-08-24

Read from the code and the database, not from a previous report. Evidence: 539 tests
passing (4 skipped), typecheck/lint/build clean, production at migration 008 with
`ADMIN=1` and no legacy roles.

**Two genuine gaps and one external dependency, all named rather than glossed:**

- **Phase 10 — outbound email does not exist.** `delivery.ts` sends exactly one message
  type, the OTP. The access-approval notification is therefore `IN_APP` only, which reaches
  a person who by definition cannot yet sign in. They learn out of band or by trying.
- **Phase 12 — ImageKit code is complete, credentials are not set.** `IMAGEKIT_PRIVATE_KEY`
  and `IMAGEKIT_URL_ENDPOINT` are absent from the production service, so uploads cannot
  work. Nothing in the code needs changing; the variables need supplying.
- **Phase 15C — no 3D character asset exists in the repository.** No `.glb`, `.gltf` or
  `.fbx` anywhere. 15A, 15B and 15D are done; 15C cannot be completed by writing code and
  must not be marked complete with a placeholder.

## Phase 0 — what was delivered

- Next.js 16, TypeScript strict, Tailwind v4, Node pinned to 24.x
- Design tokens in one file; hex literals in `src/` are a lint error
- Two identity domains, in schema and in code
- Rank rules (`canActOn`, `canAssignRole`), pure and exhaustively tested
- `001_foundation.sql` — tenancy, identity, sessions, assignments, jobs, audit log
- Migration runner: forward-only, checksum-verified, advisory-locked, runs pre-deploy
- Environment validated at boot; verified that a missing secret fails the build
- Vitest with the pool and parallelism rules that avoid known lock contention
- CI running lint, typecheck, test, build
- `railway.json` committed; security headers; health endpoint
- Documentation and seven ADRs

**Not** delivered, deliberately: any authentication, any dashboard, any feature surface.

## Phase 1 — what was delivered

Verified against the live Railway database on 2026-08-22:

- `001_foundation.sql` and `002_authentication.sql` applied. Both ran via Railway's
  `preDeployCommand`, so the automatic-migration-on-deploy path in ADR-006 is proven
  rather than assumed.
- `npm run db:verify` — **31/31 invariants pass** against the real schema: composite
  foreign keys on `consultant_assignments` and `sessions`, `owner_accounts` carrying no
  `organization_id`, `users.organization_id NOT NULL`, and both partial unique indexes.
  ADR-001 and ADR-004 are enforced by PostgreSQL, not by convention.
- The first `PLATFORM_OWNER` is seeded, status `INVITED`, no credential — it cannot sign
  in until Phase 2 builds passkey enrolment. The seed wrote its own `audit_logs` entry.
- `migrate` and `seed:owner` both verified idempotent on a second run.
- The 8 previously-skipped enum-parity tests now execute and pass, so the TypeScript
  mirrors are confirmed against the real `pg_enum`.

**Outstanding for Phase 1:** a separate throwaway database for `SQL_TEST_DATABASE_URL`.
The current one is the development database, and Phase 3's isolation suites call
`resetDatabase()`, which `TRUNCATE`s every table. Pointing the test variable at this
database would wipe the seeded owner and any development data.

## Cross-cutting work with a named home

These are easy to assume are handled. They are not, and each has an owner:

| Concern | Phase |
|---|---|
| Content-Security-Policy | 16 |
| Rate limiting — auth paths / general | 2 / 16 |
| Cross-tenant, IDOR, BOLA test suites | 3 |
| Raster + maskable icon set | 14 |
| Internationalisation (Telugu, Hindi, Kannada, Tamil, Malayalam) | after 5, before 8 |
| Dependency scanning in CI | 16 |
| Backup and restore rehearsal | 18 |
| Accessibility audit and token contrast verification | 17 |

## Documentation still owed

Master Knowledge Base v2.0 §34 specifies a `docs/` set that includes `YOGA.md`,
`DIET.md`, `ACTIVITY.md`, `REPORTING.md`, `NOTIFICATIONS.md`, `IMAGEKIT.md`, and
`PWA.md`. None exist yet, deliberately: each documents a subsystem that has not been
built, and an empty file created to complete a set is worse than an absent one — it reads
as coverage. Each arrives with the phase that builds its subsystem.

v2.0 §34 also names four ADRs by topic (`authentication`, `database`, `multitenancy`,
`railway`). The seven ADRs in `decisions/` cover that ground at finer grain and are cited
by filename from source comments, lint rules, and migration headers; they are not renamed
to match, because renaming would break those citations.

## Scope decided 2026-08-22

Both questions raised by the contradiction between the posters and the written brief are
now settled by the user. Full reasoning in `BMAD/01-analysis/PRODUCT-SCOPE.md`.

- **Billing is OUT of scope for the MVP.** Phase 9's owner dashboard is analytics and
  operations only. No subscription columns on `organizations`, no payment provider.
- **Messaging is one-way notifications only** — consultant → customer. Phase 10 builds a
  `notifications` table and **no** `conversations` or `messages` table. No chat, no
  threads, no customer-initiated messages.

## Phase 15 — split, and why

The visual brief of 2026-08-23 requires a premium 3D experience. Phase 15 was previously
reported **blocked**, because a rigged human yoga character is art production rather than
engineering. Splitting it resolves that honestly:

| | Scope | Completable now |
|---|---|---|
| **15A** | `components/3d/` architecture, `YogaScene`/`YogaCharacter`/`YogaPose`, database-driven `model_reference`, `YogaFallback` | **yes**, against a development placeholder |
| **15B** | Seven-section scroll journey, one continuous camera path, reduced-motion path | **yes** |
| **15C** | Production-quality rigged character + per-pose animation clips | **no — blocked on art** |
| **15D** | Perf budget, WebGL-absent and slow-device fallbacks, contrast and keyboard audit | **yes** |

Because scenes take a `model_reference` from the database rather than a hardcoded model
(ADR-014), the placeholder and the final asset are the same code path — swapping them is a
data change, not a rewrite. That is what makes deferring 15C safe.

**Phase 15 is not complete until 15C is.** No report may say otherwise while a development
placeholder is on screen.

## Visual experience programme

Design system: `docs/UX-SPECIFICATION.md` (Botanical Wellness Glass).
Impact and constraints: `BMAD/01-analysis/VISUAL-UPGRADE-IMPACT.md`. Stack: ADR-014.

Delivered in groups, each independently reviewable, in the order the brief gives (§28):

| Group | Contents | Status |
|---|---|---|
| A | Design tokens, glass primitives, backgrounds, typography | not started |
| B | Navigation, dialogs, dashboard components | not started |
| C | Landing redesign, 2D motion | not started |
| D | 3D — 15A, 15B, 15D | not started |
| E | 15C production assets | blocked |

This programme changes presentation only. Authentication, RBAC, organisation isolation,
API contracts, and the database are untouched — verified in the impact analysis, §1.

## Open questions

1. **The official logo.** Working from a redrawn placeholder — see `docs/BRANDING.md`.
2. **Linear team.** Not yet recorded. The workspace has TempleOS (`TEM`) and Marketives
   (`MAR`); neither obviously owns a new wellness product.
3. **"Needs attention"** — the definition in `docs/METRICS.md` is `[proposed]`. It decides
   what a consultant looks at first, so it wants a care judgement, not an engineering one.
   Needed before Phase 8.
4. **Regulatory posture** — jurisdiction and any compliance regime that applies to holding
   identifiable health data. Needed before real customer data exists, not before a
   particular phase.

## Phase 15C — blocked on an external asset

15A (viewer), 15B (scroll journey) and 15D (performance and accessibility) are complete and
verified. **15C is not, and it is not blocked on engineering judgement — it is blocked on a
production character and animation set that does not exist yet.**

`docs/3D-ASSET-CONTRACT.md` is the specification to commission or purchase against.

**The asset-independent half is now built** (2026-08-24): glTF loading behind the existing
lazy boundary, self-hosted Draco and KTX2 decoders, a per-instance `AnimationMixer`,
skeleton-safe cloning, clip resolution from `animation_reference`, cross-faded transitions,
and decode-failure handling. §8 of the contract records what remains unverifiable until a
real GLB exists — the loader has never loaded one.

**15C is COMPLETE only when a real asset is integrated and the §7 checklist passes.** A
better-looking placeholder does not close it.
