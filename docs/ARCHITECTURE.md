# Architecture

## Shape

A single full-stack Next.js App Router application, deployed as one unit on Railway.
No separate backend service, no worker process, no Redis.

```
src/
  app/
    (public)/         marketing, install page
    (auth)/           tenant sign-in — customer, admin, org owner
    owner/            platform owner — separate login surface (ADR-001)
    api/              the HTTP boundary
      cron/           job-queue drains, authorised by CRON_SECRET
      health/         Railway healthcheck
  components/ui/      shadcn primitives
  features/           per-domain UI and server actions
  server/
    auth/             sessions, passkeys, OTP, delivery adapters
    authorization/    identity domains, role ladder, rank rules
    db/               pool, enum mirrors, constraint translation
    repositories/     the ONLY place SQL lives
    services/         business rules
    validation/       zod schemas shared by routes and forms
  lib/                env, branding, i18n
migrations/           NNN_name.sql, forward-only
scripts/              migrate.mjs, migration-plan.mjs
tests/                integration suites needing a real database
docs/  decisions/
```

## Request path

```
request
  → app/api/*          validate input (zod), resolve identity — nothing else
  → authorization      identity domain → organization → role → ownership → permission
  → services           business rules
  → repositories       parameterised SQL, organization-scoped
  → PostgreSQL
```

**`app/api/*` is the boundary.** Validation and identity resolution happen here and
nowhere else. Business rules do not live in route handlers, and never in React
components.

**`repositories/` is the floor.** One module per domain. Every function that touches an
org-scoped table takes `organizationId` as a required first argument. There is no
overload that omits it, because an optional scope is a scope somebody eventually omits.

## Tenancy — the load-bearing invariant

Three properties, each of which must survive every future change:

1. **Scope comes from a trusted boundary.** `organizationId` is read from the
   authenticated session row, never from a request body, query string, or path segment.
   A client-supplied tenant id is forgeable, so isolation cannot rest on it. (ADR-004)

2. **The database enforces it too.** `users` carries `UNIQUE (id, organization_id)`, and
   org-scoped tables reference it with *composite* foreign keys including
   `organization_id`. PostgreSQL therefore refuses to link a consultant in one
   organization to a customer in another, whatever the application layer believes.
   Cross-tenant leakage through those tables is unrepresentable, not merely untested.

3. **The identity domains are separate.** Platform and tenant principals live in
   different tables, with different session tables, cookie names, and signing secrets.
   Boot fails if the two secrets match. (ADR-001)

## Layers, and what may not cross them

| Layer | May import | May not |
|---|---|---|
| `app/api/*` | services, validation, authorization | repositories, the pool |
| `services/` | repositories, authorization, adapters | `next/*` request objects |
| `repositories/` | `server/db` | services, features |
| `features/` | services via server actions | repositories, the pool |

The pool restriction is enforced by ESLint (`adira/server-boundary`), not by convention.

## Asynchronous work

There is no worker. A `jobs` table is drained by Railway Cron POSTing to `/api/cron/*`
with `Authorization: Bearer $CRON_SECRET`. The claim query is
`SELECT … FOR UPDATE SKIP LOCKED`, so overlapping cron invocations neither block nor
double-process. (ADR-003)

Consequence: a job must be completable within an HTTP request. Genuinely long work is
expressed as many small jobs, not one long one. If that ever stops being enough, a
worker service is a new decision — the job contract itself would not have to change.

Cron schedules are configured in the Railway dashboard and are therefore invisible to
git. `docs/RAILWAY.md` carries the authoritative list; update it when a schedule changes.

## Configuration

`src/lib/env-schema.ts` defines the contract; `src/lib/env.ts` parses `process.env` at
module load and throws with every offending key named. A misconfigured deploy fails as a
deploy, not as a mystery 500 on whichever request first needs the value.

Public values live in `env.client.ts` and are compiled into the browser bundle — treat
anything there as published.

## Testing

Vitest, node environment, tests colocated as `*.test.ts` beside the module. Suites that
need a real database live in `tests/` and skip when `SQL_TEST_DATABASE_URL` is unset.
`fileParallelism` is off. See `docs/TESTING.md` for why both of those matter.

## Not yet built

Phase 0 delivered the foundation only. Authentication (Phase 2), the service and
repository layers (Phase 4), and every feature surface are still empty. `docs/ROADMAP.md`
holds the phase order.
