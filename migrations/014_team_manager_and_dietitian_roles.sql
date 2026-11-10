-- 014 — Add TEAM_MANAGER and DIETITIAN to `tenant_role` (ADR-016).
--
-- ADDITIVE ONLY: two enum labels. No row changes role and nothing is backfilled. The labels
-- are not USED in this migration — PostgreSQL forbids using a new enum label in the same
-- transaction that adds it (invariant 6), and nothing here needs to.

ALTER TYPE tenant_role ADD VALUE IF NOT EXISTS 'TEAM_MANAGER';
ALTER TYPE tenant_role ADD VALUE IF NOT EXISTS 'DIETITIAN';

COMMENT ON TYPE tenant_role IS
  'Tenant role ladder: ADMIN(20) > TEAM_MANAGER(18) > TRAINER(15) = DIETITIAN(15) > STAFF(12) > USER(10). '
  'ORG_OWNER and CUSTOMER are legacy labels (ADR-013). Member data is assignment-scoped for every role.';
