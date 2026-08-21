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
