-- 007_role_backfill_and_assignments.sql
--
-- ADR-013, deployment 2 of three. THE ORDERING IN THIS FILE IS LOAD-BEARING.
--
--   1. Seed assignments for every ORG_OWNER      <- FIRST, while they still have reach
--   2. Backfill ORG_OWNER -> ADMIN
--   3. Backfill CUSTOMER  -> USER
--   4. Drop users_one_org_owner_idx              <- LAST, once no row holds ORG_OWNER
--
-- Reverse steps 1 and 2 and the only real administrator in production becomes an ADMIN
-- with no assignments, which under ADR-013 means an admin who can see no members at all.
-- The whole file runs in one transaction, so the intermediate states are never observable
-- — but the order still matters, because step 1 reads what step 2 destroys.
--
-- WHY SEEDING IS NOT A PRIVILEGE GRANT
--
-- Before this migration an ORG_OWNER could read every member of their organization by
-- definition. The rows inserted below RECORD that reach explicitly rather than granting
-- anything new. The alternative — making ADMIN organization-wide for member data so no
-- seeding is needed — is the exact failure ADR-013 exists to prevent, and it is not on
-- the table.
--
-- Every insert is audited as `assignment.migrated`, so the trail explains why an
-- assignment exists that no human created.
--
-- IDEMPOTENT. Re-running produces no duplicates and no second audit entry: step 1 is
-- guarded by NOT EXISTS, steps 2 and 3 match no rows the second time, and step 4 uses
-- IF EXISTS.


-- ---------------------------------------------------------------------------
-- 1. Seed assignments — BEFORE any role changes
-- ---------------------------------------------------------------------------
-- One row per (org owner, member) pair that does not already have a live assignment.
-- `consultant_assignments_active_idx` is a partial unique index over
-- (organization_id, consultant_id, customer_id) WHERE ended_at IS NULL, so the NOT EXISTS
-- guard and the index agree about what "already assigned" means.

INSERT INTO consultant_assignments (organization_id, consultant_id, customer_id)
SELECT owner.organization_id, owner.id, member.id
  FROM users owner
  JOIN users member
    ON member.organization_id = owner.organization_id
   AND member.role IN ('CUSTOMER', 'USER')
 WHERE owner.role = 'ORG_OWNER'
   AND NOT EXISTS (
     SELECT 1 FROM consultant_assignments ca
      WHERE ca.organization_id = owner.organization_id
        AND ca.consultant_id = owner.id
        AND ca.customer_id = member.id
        AND ca.ended_at IS NULL
   );


-- Record why those assignments exist. Written from the same statement that could have
-- created them, so an assignment can never appear in the trail without its reason.
INSERT INTO audit_logs
  (organization_id, actor_domain, actor_id, actor_label, action, resource_type,
   resource_id, outcome, metadata)
SELECT ca.organization_id,
       'PLATFORM',
       NULL,
       'migrations/007_role_backfill_and_assignments.sql',
       'assignment.migrated',
       'consultant_assignment',
       ca.id::text,
       'SUCCESS',
       jsonb_build_object(
         'consultantId', ca.consultant_id,
         'customerId', ca.customer_id,
         'reason', 'ADR-013 owner-to-admin migration: recording pre-existing reach'
       )
  FROM consultant_assignments ca
  JOIN users owner ON owner.id = ca.consultant_id
 WHERE owner.role = 'ORG_OWNER'
   AND ca.ended_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM audit_logs al
      WHERE al.action = 'assignment.migrated'
        AND al.resource_id = ca.id::text
   );


-- ---------------------------------------------------------------------------
-- 2. ORG_OWNER -> ADMIN
-- ---------------------------------------------------------------------------
-- Safe now: every owner's reach has been written down as assignments above.

UPDATE users SET role = 'ADMIN' WHERE role = 'ORG_OWNER';


-- ---------------------------------------------------------------------------
-- 3. CUSTOMER -> USER
-- ---------------------------------------------------------------------------
-- 'USER' was added to the enum by 006 and committed there, which is what makes it usable
-- in this transaction. Adding and using it in one migration is rejected by PostgreSQL.

UPDATE users SET role = 'USER' WHERE role = 'CUSTOMER';


-- ---------------------------------------------------------------------------
-- 4. Drop the single-owner index
-- ---------------------------------------------------------------------------
-- It enforced exactly one ORG_OWNER per organization. The merged model has many admins,
-- so it must go — but only now, once step 2 has left no row holding ORG_OWNER.
--
-- The guarantee it provided (every organization has an identifiable principal) does not
-- disappear: it moves up a layer as "an organization must keep at least one ACTIVE admin",
-- enforced transactionally in `setMemberStatus` (ADR-013 Q3). A partial unique index
-- cannot express "at least one", which is why the rule cannot stay in the schema.

DROP INDEX IF EXISTS users_one_org_owner_idx;


-- ---------------------------------------------------------------------------
-- What is deliberately NOT done here
-- ---------------------------------------------------------------------------
-- `tenant_role` still lists ORG_OWNER and CUSTOMER. PostgreSQL cannot drop an enum value
-- without recreating the type and rewriting every column that uses it, which is a table
-- rewrite under a live application. They are tombstones: accepted by the type, written by
-- nothing. Deployment 3 may remove them; leaving them costs only tidiness.
--
-- `account_status.PENDING` is likewise now dead — access requests own that lifecycle, in
-- their own table with their own status enum. It is not reused.
