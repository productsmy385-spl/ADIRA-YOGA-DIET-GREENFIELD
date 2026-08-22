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
| 2 | Authentication — passkeys, OTP, sessions | |
| 3 | Authorization, RBAC, multi-tenancy enforcement + isolation suites | |
| 4 | Service and repository layers | |
| 5 | Customer dashboard | |
| 6 | Yoga engine | |
| 7 | Diet engine | |
| 8 | Admin / consultant dashboard | |
| 9 | Owner dashboards — platform and organization | |
| 10 | Notifications | |
| 11 | Reports + job queue drain | |
| 12 | ImageKit media | |
| 13 | Import / export | |
| 14 | PWA install, icon set | |
| 15 | 3D yoga experience | |
| 16 | Security hardening — CSP, rate limiting, dependency scanning | |
| 17 | Performance and accessibility | |
| 18 | Production deployment | |

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
