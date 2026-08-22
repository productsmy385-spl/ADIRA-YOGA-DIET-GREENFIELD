# Adira — working notes

Multi-tenant yoga therapy and wellness platform. Next.js 16 · TypeScript · PostgreSQL
(raw SQL, no ORM) · Tailwind v4 · Railway.

Read `docs/ARCHITECTURE.md` before substantial work. Decisions are in `decisions/`.

## Sources of truth

Two supplied documents govern this project. Both are the user's own words, stored
verbatim. **Never edit either to reflect what was built.**

| Question | Document |
|---|---|
| WHAT the product must be | `docs/KNOWLEDGE-BASE.md` — Master Knowledge Base v2.0 |
| HOW work is planned and executed | `/BMAD/BMAD-PLAN.md` — the 9-phase method |

`BMAD/STATUS.md` records where the project actually stands against that method, including
which BMAD artefacts already exist elsewhere. **Read it before creating any BMAD
document** — Phase 4's architecture set already lives in `docs/`, and duplicating it is
how the two copies start disagreeing.

`docs/KNOWLEDGE-MAP.md` says which layer owns which knowledge.

### The BMAD loop

```
Analysis → Product → UX → Architecture → Epics & Stories
        → Implementation → Testing & Review → Deployment → Retrospective
```

Do not skip planning stages for a major feature. Infrastructure work already covered by
an ADR may proceed directly. The first work that genuinely needs Phases 1–3 first is the
customer dashboard — there is no PRD or acceptance criteria behind any code yet.

### When the user supplies a new document

Store it verbatim, register it in `docs/SOURCE-DOCUMENTS.md`, reconcile it against what
exists, raise an ADR if it changes a decision, and update the Knowledge Base at
`~/.claude/KnowledgeBase/Projects/Adira/`. The full rule is in that register. A superseded
document is kept and marked, never deleted.

Confirm which product a document belongs to before acting on it — the user runs several
projects that use this same method and similar filenames.

## Invariants — breaking any of these is a security regression, not a refactor

1. **Tenant scope comes from the session, never from the client.** Every org-scoped
   repository function takes `organizationId` as a required argument sourced from the
   authenticated session. An endpoint that accepts an organization id as a parameter is
   a bug. (ADR-004)

2. **The two identity domains never mix.** Platform owners live in `owner_accounts` with
   their own session table, cookie, and signing secret. Tenant users live in `users`.
   No code path upgrades a tenant session into platform privilege. (ADR-001)

3. **`ADMIN` is assignment-scoped, not org-wide.** It is the combined admin/consultant
   role and reaches only the customers in `consultant_assignments`. Only `ORG_OWNER` has
   organization-wide reach. (ADR-002)

4. **Rank rules are strict.** `canActOn` / `canAssignRole` require the actor to strictly
   outrank the target, so peers cannot act on each other.

5. **SQL lives only in `src/server/repositories/` and `src/server/db/`.** Every value is
   a bound parameter. A lint rule blocks importing the raw pool elsewhere. (ADR-005)

6. **Migrations are forward-only.** Never edit or rename an applied migration — the
   runner verifies checksums and will refuse. Add a new one instead. Add an enum value
   in one migration and use it in a later one; the runner wraps each file in one
   transaction and PostgreSQL forbids using a new label before commit. (ADR-006)

7. **Colour is defined once**, in `src/app/globals.css`. A hex literal in `src/` is a
   lint error. Use semantic tokens (`bg-primary`, `text-muted-foreground`).

8. **Never log a secret.** No OTP values, session tokens, or credentials in
   `audit_logs`, error messages, or console output. Env validation errors name the key
   and never echo the value.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | development server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | eslint |
| `npm test` | vitest, colocated `*.test.ts` |
| `npm run build` | production build |
| `npm run migrate` | apply pending migrations |
| `npm run migrate:dry` | list pending migrations, change nothing |

Run typecheck, lint, and test before calling work done.

## State

Last verified 2026-08-22.

Railway PostgreSQL is **provisioned and live**, migrations `001`–`004` applied. The app
deploys from GitHub `main`; a push builds, runs `npm run migrate` pre-deploy, and goes
live at the Railway service URL. Authentication is **implemented and proven end to end**
against that database: an emailed one-time code issues, verifies, and establishes a
session, with the code stored only as a salted hash and the session token only as an
HMAC keyed by its identity domain.

Built: foundation, repository layer, sessions and guards, OTP sign-in, WebAuthn passkeys,
programmes and assignments, the activity engine, and the customer daily loop.

Two operational limits that are easy to forget, because neither fails loudly:

- **Email delivery reaches exactly one address.** Resend is on its sandbox, which
  accepts sends only to the account's own signup address. Every other recipient gets a
  403 that surfaces as `otp.issue FAILURE DELIVERY_FAILED` in `audit_logs` while the
  sign-in form still says "if that address has an account…". **No second person can sign
  in until a domain is verified.**
- **`.env.local` points at production.** `docs/RAILWAY.md` forbids this. The staging
  environment exists but is unmigrated and has no public proxy. Until that is fixed,
  never set `SQL_TEST_DATABASE_URL` — the helpers in `tests/helpers/sql-db.ts` run
  `TRUNCATE` on every table.

Phase order and scope: see `docs/ROADMAP.md`. **Do not describe build progress in
user-facing copy** — `src/app/page.tsx` once told visitors "there is no application to
sign in to yet" for as long as it took someone to notice, because stale copy fails
silently.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
