# Pre-production check — migrations 006, 007, 008

**Status: DEPLOYED AND VERIFIED — 2026-08-24. Production is at 008.**

Deployed commit `8250a9b` (`3511d70..8250a9b` → `origin/main`). All three migrations
applied by Railway's pre-deploy step. The post-migration diff against the 005 baseline was
**exactly** the seven predicted changes and nothing else — see `.baseline/production-008.json`.
Pre-migration artifact `.baseline/pre-006-008.dump` retained.

> **2026-08-24 — the backup gap is closed, but not the way it was planned.** Railway
> volume snapshots are **unavailable on this workspace's plan** (`volumes.maxBackupsCount:
> 0`), so no snapshot could be created through the API. A full `pg_dump` custom-format
> archive was taken instead, over `railway ssh`, read-only. See §1.

Baseline taken read-only from `railway` at `2026-08-24T01:21:06Z`. Every figure below was
read from the live database or from the migration SQL, not assumed.

---

## 1. Backup and recovery capability — ❌ **NONE EXISTS**

Four independent checks against the production Postgres
(service `318e6bae-e820-4d0d-92f9-0b0efd91b5c6`, environment `production`, the service
behind `altaria.proxy.rlwy.net:46135/railway` — the same one the baseline was read from):

| Check | Command | Result |
|---|---|---|
| Point-in-time recovery | `railway postgres pitr status --service Postgres --environment production` | `enabled: false`, `bucketWired: false` |
| Backup schedules, per service | `projectCompliance.serviceBackups` | `schedules: []` — for **both** Postgres services |
| Schedules on the production volume | `volumeInstanceBackupScheduleList` | `[]` |
| Snapshots that actually exist | `volumeInstanceBackupList` | `[]` — **zero** |

**There is no continuous backup, no scheduled backup, and not one stored snapshot.** If
007 goes wrong there is nothing on Railway to restore from.

`pg_dump` is not installed on the development machine either.

### What does exist

A complete logical export: **88 rows across 26 tables**,
`.baseline/export-2026-08-24T01-24-08-961Z.json`, taken in a `SERIALIZABLE READ ONLY`
transaction so every table is read at one instant. Session and OTP hashes are redacted.

That is a real safety net for a database this size — 1 organization, 1 user, 1 programme,
54 audit rows — and it is **not** a substitute for provider-level recovery. It restores
data, not a cluster, and it has never been exercised as a restore.

### Why the approved snapshot could not be taken

`volumeInstanceBackupCreate` returned `Not Authorized`; the CLI's
`railway postgres pitr backup create` returned `OAUTH_INSUFFICIENT_GRANT` with a hint to
re-authenticate. **The hint is misleading.** The workspace plan is the real constraint:

```
workspace.subscriptionPlanLimit.volumes = {
  maxBackupsCount: 0,
  maxBackupsUsagePercent: 0,
  ...
}
```

`subscriptionModel: "USER"`. Zero volume backups are permitted, so re-running
`railway login` would not have helped. `volumeInstanceBackupList` remains `[]`.

### What was taken instead — a real pg_dump

`pg_dump` 18.6 is present inside the production Postgres container and `railway ssh` runs
non-interactive commands, so the standard PostgreSQL backup was available without any plan
change, any infrastructure change, or any write:

```bash
railway ssh --service Postgres --environment production   'pg_dump -h /var/run/postgresql -U postgres -d railway -Fc | base64 -w0'
```

| | |
|---|---|
| Artifact | `.baseline/pre-006-008.dump` |
| Format | PostgreSQL custom (`-Fc`), restorable with `pg_restore` |
| Size | 107,999 bytes |
| SHA-256 | `512f75d2b70f5a3a874f587eba80a2677ecc503302b6892e853ccba84aacafca` |
| Magic verified | `PGDMP` |
| TOC entries | 232, including TABLE DATA for `users`, `organizations`, `programmes`, `audit_logs`, `sessions` |
| State captured | migrations 001–005, `tenant_role` = ORG_OWNER/ADMIN/CUSTOMER, **no `USER` label** |

Base64 was used because the SSH channel carries text; the decoded artifact was verified by
magic bytes and by the object names present in its table of contents, and the authoritative
TOC was listed with `pg_restore -l` in-container.

`pg_dump` takes ACCESS SHARE locks and modifies nothing. Production was re-verified
afterwards as still at 001–005 with `ORG_OWNER = 1`.

**Restore is untested.** No restore was attempted, deliberately — the only place to test one
is a database that does not exist here. The archive is standard-format and structurally
verified, which is materially stronger than the JSON export, but it is not a rehearsed
recovery.

### Still recommended, separately

PITR remains the right permanent answer and is deferred by decision: enabling it redeploys
the Postgres service, and a production restart does not belong in a migration window.

## 2. Current production migration version

```
001_foundation.sql
002_authentication.sql
003_webauthn_challenges.sql
004_programmes_and_activities.sql
005_notifications_reports_media.sql
```

**Confirmed at 005.**

## 3. Pending migrations

`006_role_merge_and_access_requests.sql`, `007_role_backfill_and_assignments.sql`,
`008_access_approved_notification.sql` — confirmed by `npm run verify:deploy`.

## 4. Exact SQL and data impact

### 006 — additive only, **zero rows changed**

| Statement | Effect on production |
|---|---|
| `ALTER TYPE tenant_role ADD VALUE IF NOT EXISTS 'USER'` | enum gains a 4th label; no row touched |
| `CREATE TYPE access_request_status` | new enum: PENDING, APPROVED, REJECTED, CANCELLED |
| `CREATE TABLE access_requests` | new empty table |
| 3 indexes + 1 `updated_at` trigger | on the new table only |

Nothing here reads or writes an existing table. This matters because Railway applies
migrations while the **previous** container is still serving traffic.

### 007 — the only migration that changes data

Order is load-bearing and correct in the file: seed assignments *before* the role
backfill, because step 1 reads what step 2 destroys.

| Step | SQL | Rows affected in production |
|---|---|---|
| 1 | `INSERT INTO consultant_assignments … WHERE owner.role='ORG_OWNER' AND member.role IN ('CUSTOMER','USER')` | **0** — there are zero members |
| 2 | `INSERT INTO audit_logs … 'assignment.migrated'` | **0** — no assignments were created |
| 3 | `UPDATE users SET role='ADMIN' WHERE role='ORG_OWNER'` | **1** |
| 4 | `UPDATE users SET role='USER' WHERE role='CUSTOMER'` | **0** |
| 5 | `DROP INDEX IF EXISTS users_one_org_owner_idx` | index removed |

Idempotent: step 1 is guarded by `NOT EXISTS`, steps 3–4 match nothing on a re-run, step 5
uses `IF EXISTS`.

### 008 — additive only, **zero rows changed**

`ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'ACCESS_APPROVED'`.

## 5. Expected role transition

| | Before | After |
|---|---|---|
| ORG_OWNER | 1 (ACTIVE) | 0 |
| ADMIN | 0 | **1** |
| USER | 0 | **0** |
| CUSTOMER | 0 | 0 |

`tenant_role` will list `ORG_OWNER, ADMIN, CUSTOMER, USER`. `ORG_OWNER` and `CUSTOMER`
remain as tombstones — PostgreSQL cannot drop an enum value without recreating the type
and rewriting every column that uses it, which is a table rewrite under a live
application.

## 6. Expected assignment changes

**None. 0 before, 0 after.** Production has zero members, so the seeding step matches no
rows. This is the expected outcome, not a failure of the migration.

The single admin will have **no caseload**, which under ADR-013 means they can administer
the organization but cannot read any member's health data — because there are no members.
The first member added through the normal flow gets an assignment through the normal flow.

## 7. Expected notification changes

None to data. `notification_kind` gains `ACCESS_APPROVED`; the notifications table stays
empty (0 rows). `ACCESS_APPROVED` defaults to `IN_APP` only.

## 8. Expected audit entries

**0 new rows from the migration** — the `assignment.migrated` insert is driven by the
assignments created in step 1, and there are none. `audit_logs` stays at **54**.

## 9. Expected constraint and index changes

| Change | Direction |
|---|---|
| `users_one_org_owner_idx` | **dropped** — the merged model has many admins |
| `access_requests_one_pending_idx` | added (partial unique, `WHERE status='PENDING'`) |
| `access_requests_queue_idx` | added |
| `access_requests_email_idx` | added |
| `access_requests_reviewer_fk` | added — composite FK, cross-tenant approval unrepresentable |
| `access_requests_review_consistency` | added — a decided request must say who and when |

Index count: **87 → 90** (−1 dropped, +4 added, counting the new primary key).

The guarantee `users_one_org_owner_idx` provided — every organization has an identifiable
principal — does not vanish. It moves up a layer as "an organization must keep at least one
ACTIVE admin", enforced transactionally in `setMemberStatus`. A partial unique index cannot
express "at least one", which is why the rule cannot stay in the schema.

## 10. Session behaviour after the role migration

**No session is invalidated and no re-login is required.**

`TENANT_SESSION_SELECT` joins `users` on every request and reads `u.role` live — the
`sessions` table stores no role of its own ([sessions.ts:83](src/server/repositories/sessions.ts#L83)).
The moment 007 commits, the existing session observes `ADMIN` instead of `ORG_OWNER`.

Production holds **2 session rows, 1 of them live** (the other expired or revoked).

One behavioural consequence worth knowing: `normaliseRole` currently maps a stored
`ORG_OWNER` to `ADMIN` and sets `storedRole`, which activates the ADR-013 grandfather
clause granting organization-wide member reach. **After 007 the stored role is genuinely
`ADMIN`, so `storedRole` is no longer set and the grandfather clause stops applying.** With
zero members and zero assignments this changes nothing observable today — but it is the
real semantic change in the deployment, and it is why the assignment seeding in step 1
exists at all.

---

## Deployment sequence, once approved

0. **Establish a restore point.** See §1 — there is currently none.
1. `node scripts/production-baseline.mjs --json > .baseline/before.json`
2. `git push origin main`
3. Watch Railway's pre-deploy `npm run migrate` output — confirm 006, 007, 008 each apply
4. Confirm the application starts
5. `npm run verify:deploy` — must come back clean
6. `node scripts/production-baseline.mjs --compare .baseline/before.json`
7. Confirm the diff is exactly: migrations +3, `tenant_role` +USER, `notification_kind`
   +ACCESS_APPROVED, roles ORG_OWNER→ADMIN, `users_one_org_owner_idx` present→absent,
   `access_requests` table appears at 0 rows. **Any other difference is a stop.**
8. Real-application smoke test

**Do not test 007 by applying and reverting it on production.** The runner verifies
checksums and forward-only is an invariant (ADR-006); a revert means a new migration
written deliberately.
