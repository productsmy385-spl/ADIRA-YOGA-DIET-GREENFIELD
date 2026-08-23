# Database

Railway PostgreSQL. Hand-written parameterised SQL, no ORM (ADR-005).

## Migration workflow

Forward-only, numbered, applied in filename order, tracked by full filename in
`schema_migrations`.

```bash
npm run migrate       # apply pending
npm run migrate:dry   # list pending, change nothing
```

The runner (`scripts/migrate.mjs`) is wired as Railway's `preDeployCommand`, so a deploy
cannot succeed against an unmigrated database. Deciding *what* to apply lives in
`scripts/migration-plan.mjs`, which is pure and tested.

### Four rules the runner enforces

1. **Filenames must be `NNN_description.sql`** with a zero-padded sequence of at least
   three digits. Unpadded, `10_` sorts before `9_` and migration 10 applies first —
   silently, and differently depending on how many migrations exist.
2. **No two migrations may share a sequence number.** Ambiguous order is refused.
3. **An applied migration may never be edited.** Checksums are recorded and verified;
   a modified file is a hard error. Express the change as a new migration.
4. **One transaction per file.** A failed migration leaves nothing behind.

### The enum trap

Because each file is one transaction, and PostgreSQL forbids *using* an enum label added
by `ALTER TYPE … ADD VALUE` until that transaction commits:

> **Add an enum value in one migration. Use it in a later one.**

A migration that adds `'PAUSED'` to `activity_status` and then creates
`CREATE INDEX … WHERE status = 'PAUSED'` will fail at apply time. Prefer a composite
index led by `(organization_id, status, …)` over a partial index on a newly added label.

`CREATE TYPE … AS ENUM` and using it in the same migration is fine — the restriction
applies only to `ALTER`.

### Keep `db/types.ts` in step

The TypeScript enum unions in `src/server/db/types.ts` are hand-mirrored from SQL. When a
migration touches an enum, update that file **in the same change**. `tests/enum-parity.test.ts`
reads `pg_enum` from a live database and fails on any disagreement — but it only runs
where a test database is configured, so it protects CI, not your laptop.

## Shape

### Tenancy

`organizations` is the tenant root. Every org-scoped table carries a non-null
`organization_id` with a foreign key, and indexes lead with it because queries do.

**Composite foreign keys are the isolation mechanism.** `users` carries a redundant
`UNIQUE (id, organization_id)` purely so other tables can reference *the pair*:

```sql
FOREIGN KEY (consultant_id, organization_id)
  REFERENCES users (id, organization_id)
```

PostgreSQL now refuses a cross-tenant link itself. This is worth the redundant index:
application-layer scoping is a check somebody eventually forgets, and its absence is
invisible in review.

### Tables in `001_foundation.sql`

| Table | Notes |
|---|---|
| `organizations` | tenant root; `join_code` is unique, NULL by default |
| `owner_accounts` | PLATFORM domain — **no** `organization_id` |
| `users` | TENANT domain; email unique *per organization* |
| `consultant_assignments` | which ADMIN serves which CUSTOMER; composite FKs both sides |
| `sessions` | tenant sessions; stores a token **hash**, never the token |
| `owner_sessions` | platform sessions; separate table by design |
| `jobs` | async queue drained by cron (ADR-003) |
| `audit_logs` | append-only; no `updated_at`, no update path |

### Decisions embedded in the schema

- **Email is unique per organization, not globally.** The same person may be a customer
  at one studio and a consultant at another. A global constraint makes the second
  relationship unrepresentable and leaks account existence across tenants at signup.
- **`join_code` is NULL by default.** Signup targets a tenant by an out-of-band code,
  never by choosing from a public list — a dropdown would publish the customer list and
  let anyone queue a row against any tenant they can see. NULL default means no
  organization has self-signup until its owner deliberately enables it.
- **Exactly one `ORG_OWNER` per organization**, via a partial unique index. Enforcing it
  in application code invites a race between two concurrent promotions.
- **Sessions store `token_hash`, not the token.** A database disclosure does not hand
  over live sessions.
- **`audit_logs` has no update path.** An audit trail that can be edited is not one.

## Still to design

`001_foundation.sql` covers tenancy and identity. The domain tables — yoga programmes and
exercises, diet programmes and meals, daily activities and completions, check-ins,
appointments, consultation notes, progress records, notifications and preferences, push
subscriptions, reports, media assets, imports and exports — are added by the phase that
builds each feature, so their shape is settled by a real use rather than guessed now.

Every one of them will carry `organization_id NOT NULL` and reference `users` by the
composite key where a person is involved.

## Local development

There is no local PostgreSQL on the development machine as of Phase 0. Phase 1 provisions
Railway PostgreSQL (a `staging` database is fine for development) and applies
`001_foundation.sql` for the first time. Point `SQL_TEST_DATABASE_URL` at a **throwaway**
database — the test helpers `TRUNCATE` every table.

## Role model after ADR-013

`tenant_role` accepts four labels but the application uses two.

| Label | Status |
|---|---|
| `ADMIN` | live — organization-wide administration, assignment-scoped member data |
| `USER` | live — self only |
| `ORG_OWNER` | **tombstone**, migrated to `ADMIN` by `007` |
| `CUSTOMER` | **tombstone**, migrated to `USER` by `007` |

PostgreSQL cannot drop an enum value without recreating the type and rewriting every
column that uses it — a table rewrite under a live application. The tombstones are
therefore accepted by the type and written by nothing. `normaliseRole` maps them at the
session boundary so no business logic compares against them.

`users_one_org_owner_idx` is dropped by `007`. It enforced exactly one `ORG_OWNER` per
organization, which the merged model contradicts. The guarantee it carried — that every
organization has an identifiable principal — moves to `setMemberStatus`, which refuses to
remove the last `ACTIVE` admin inside a transaction. A partial unique index cannot express
"at least one", which is why the rule could not stay in the schema.

`account_status.PENDING` ("self-registered via join code, awaiting approval") is now dead.
Access requests own that lifecycle in their own table with their own enum, because mixing
account status with request status is the confusion the brief explicitly forbids.

## access_requests

Someone without an account asking an admin for one. Added by `006`.

| Property | Why |
|---|---|
| `organization_id` resolved from `join_code` server-side | the applicant never supplies it, and no endpoint returns an organization list to an unauthenticated caller |
| **no** `requested_role` column | approval always creates `USER`; the INSERT writes it as a literal, so a privileged role is unrepresentable rather than merely rejected |
| `access_requests_one_pending_idx` — partial unique on `(organization_id, email) WHERE status = 'PENDING'` | duplicate handling that cannot race; an application check has two submissions both find nothing and both insert |
| `access_requests_reviewer_fk` — composite `(reviewed_by, organization_id)` | PostgreSQL refuses a cross-tenant reviewer regardless of what the handler believes |
| `access_requests_review_consistency` CHECK | a decided request must name who decided it and when; an undecided one must not |

Approval and account creation happen in **one transaction**. Two statements can leave a
request marked `APPROVED` with no account behind it — a person told they have access who
cannot sign in, with no error anywhere to explain it.
