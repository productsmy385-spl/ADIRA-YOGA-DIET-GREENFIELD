# Adira — working notes

Multi-tenant yoga therapy and wellness platform. Next.js 16 · TypeScript · PostgreSQL
(raw SQL, no ORM) · Tailwind v4 · Railway.

Read `docs/ARCHITECTURE.md` before substantial work. Decisions are in `decisions/`.

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

Phase 0 complete: foundation, architecture, security model, schema design, migration and
test infrastructure. **No authentication is implemented yet** — Phase 2 owns it. The
schema is authored but not applied; Phase 1 provisions Railway PostgreSQL and runs it.

Phase order and scope: see `docs/ROADMAP.md`.
