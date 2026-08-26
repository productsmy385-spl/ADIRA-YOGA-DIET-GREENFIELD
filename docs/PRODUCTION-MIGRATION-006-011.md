# Production Database Migration Guide (006 – 011)

This guide documents the migration status, safety procedures, data impact, and deployment steps required for applying migrations `006` through `011` to the production Railway PostgreSQL database.

---

## ⚠️ Critical Notice

- **Production current migration level**: `005` (`005_notifications_reports_media.sql`)
- **Staging / Local current migration level**: `011` (`011_trainer_and_staff_roles.sql`)
- **Automatic Deployment Risk**: Railway auto-deploys on `git push origin main`, executing `npm run migrate` during pre-deploy. Pushing code dependent on `006`–`011` directly to `main` without verifying data migration safety may cause downtime or migration failures if schema invariants are broken.

---

## Summary of Migrations to Apply

| File | Name / Description | Breaking Changes / Impact | Rollback Consideration |
|---|---|---|---|
| `006_role_merge_and_access_requests.sql` | Merges access requests table and schema updates | Adds `access_requests` table, non-breaking enum additions. | Safe to apply. Forward-only. |
| `007_role_backfill_and_assignments.sql` | Backfills legacy `ORG_OWNER` to `ADMIN` & creates consultant assignments | Modifies roles in-place, drops `users_one_org_owner_idx`, creates default assignments. | Requires backup of `users` table prior to execution. |
| `008_access_approved_notification.sql` | Notification templates for access approval | Inserts notification templates. Non-breaking. | Safe to apply. |
| `009_programme_publishing.sql` | Adds `published_at` to programmes table | Adds optional timestamp column `published_at`. Non-breaking. | Safe to apply. |
| `010_occasions.sql` | Adds `occasions` table for seasonal/special practices | New table creation. | Safe to apply. |
| `011_trainer_and_staff_roles.sql` | Adds `TRAINER` and `STAFF` values to role enum & permissions | Updates role enum constraints. | Safe to apply. |

---

## Migration Safety Checklist

Before executing `npm run migrate` on the production database:

1. **Database Backup**:
   Take a snapshot/dump of the production Railway PostgreSQL instance:
   ```bash
   pg_dump $PRODUCTION_DATABASE_URL > backup_pre_006_011.sql
   ```

2. **Dry Run Verification**:
   Verify the pending migrations list against production credentials:
   ```bash
   DATABASE_URL=$PRODUCTION_DATABASE_URL npm run migrate:dry
   ```
   *Expected output:* Shows migrations `006` through `011` as pending.

3. **Database Target Identity Check**:
   Ensure `DATABASE_URL` matches the Railway production identity string (`Postgres`), NOT `adira_test` or local instances.

4. **Run Migrations**:
   ```bash
   DATABASE_URL=$PRODUCTION_DATABASE_URL npm run migrate
   ```

5. **Post-Migration Verification**:
   ```bash
   DATABASE_URL=$PRODUCTION_DATABASE_URL npm run db:verify
   ```
