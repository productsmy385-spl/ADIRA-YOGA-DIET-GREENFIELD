# Testing

Vitest, node environment. Tests are colocated as `*.test.ts` beside the module they
cover. Suites needing a real database live in `tests/`.

```bash
npm test           # once
npm run test:watch # watch
```

## Current state

49 passing, 6 skipped (the database-dependent enum-parity suite).

| Suite | Covers |
|---|---|
| `src/lib/env-schema.test.ts` | every env rule, including that errors never echo a value |
| `src/server/authorization/permissions.test.ts` | both rank rules, every role pair, both domains |
| `scripts/migration-plan.test.mjs` | ordering, padding, duplicate sequences, checksum drift, idempotency |
| `tests/enum-parity.test.ts` | TS enum mirrors vs `pg_enum` — **skips without a database** |

## Two rules for database tests

Both were learned the hard way on TaskFlow HR. Please do not simplify either away.

### One pool

`tests/helpers/sql-db.ts` returns a single shared pool. `resetDatabase()` issues
`TRUNCATE`, which needs an ACCESS EXCLUSIVE lock; a second pool's idle connections hold
table locks that prevent that lock being granted.

The symptom is a suite that passes alone and times out in a full run — which reads like
flakiness, and gets "fixed" by raising the timeout, which hides it.

### `fileParallelism: false`

Set in `vitest.config.mts` for the same reason.

Note its limit: it serialises files within **one** vitest process. It cannot coordinate
across two concurrent `vitest` invocations against the same database — that produces the
same failure shape with *varying* counts, because each run truncates the other's
fixtures. When verifying during concurrent work, migrate a throwaway database and point
`SQL_TEST_DATABASE_URL` at that.

### Skipping is not passing

Database suites use `describe.skip` when `SQL_TEST_DATABASE_URL` is unset, so a
contributor without a database still gets a green run. CI always sets it. A skipped
suite is reported as skipped — do not read it as covered.

> `SQL_TEST_DATABASE_URL` must point at a **throwaway** database. The helpers truncate
> every table. Never point it at development or production data.

## Required before Phase 3 is done

These are named now so they cannot be quietly skipped later. Each must exist as a real
test against a real database:

1. Customer A cannot read Customer B — every resource type, not just profiles.
2. Organization A cannot read Organization B — every org-scoped table.
3. A customer cannot reach any admin or owner API.
4. An `ADMIN` cannot reach a customer they are not assigned to.
5. A tenant session cannot be used against a platform-owner route, and the reverse.
6. Changing an id in a URL returns 403, not 404-shaped silence and not a filtered
   empty result.

Point 6 matters: an authorization failure and a missing row must be distinguishable in
the code and indistinguishable to the caller, or the response becomes an existence
oracle.

## Definition of done

A feature is complete when UI, backend, database, authentication, authorization,
validation, error/loading/empty/success states, mobile and desktop layouts, tests,
typecheck, lint, production build, security review, and documentation are all done.

A working UI over invented data is not done. A login without authorization is not done.

## One test run at a time

`tests/helpers/sql-db.ts` serialises test FILES inside one vitest process
(`fileParallelism: false`), because `resetDatabase()` issues `TRUNCATE ... CASCADE` and
needs an ACCESS EXCLUSIVE lock that a concurrently-running file's idle connections will
not grant.

**It cannot coordinate across two `vitest` invocations against the same database**, and
this repository is worked on by more than one agent session at a time, so that is not a
theoretical limit.

Observed on 2026-08-24: a full server run reported 30 failures, every one of them inside a
fixture seed — `createOrganization`, `createUser`, `assignments.ts` — with
`users_organization_id_fkey` violations. A second run had been started while the first was
in flight, and each was truncating the other's fixtures mid-test. Nothing was wrong with
the code.

The signature points at the application repositories, so the instinct is to debug
`createUser`. Before doing that:

1. Check no other test run is in flight (including a backgrounded one).
2. Check no other session is mid-edit of a file the suite imports — a pure suite failing
   alongside the database ones is the tell.
3. Re-run alone. Only failures that survive a solo run are real.

## When the database is unreachable

The suites talk to Railway over its public proxy, so a run can fail for reasons that have
nothing to do with the code. `getaddrinfo ENOTFOUND`, `ECONNRESET`, or every file after
the first failing instantly inside `resetDatabase` are all network symptoms, not
assertions. Report them as an unverified run, never as a failing suite — and never as a
passing one.

Without `SQL_TEST_DATABASE_URL` the database suites `describe.skip` themselves, so a
contributor with no test database still gets a green run. **Skipping is not passing.** Say
which suites were skipped.
