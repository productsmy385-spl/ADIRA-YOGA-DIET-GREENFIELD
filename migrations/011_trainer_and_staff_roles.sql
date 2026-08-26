-- 011_trainer_and_staff_roles.sql
--
-- Add TRAINER and STAFF to `tenant_role`.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- WHY THESE ROLES EXIST
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ADR-002 closed by describing this exact migration:
--
--   "If the four-role model is later wanted, `ADMIN` splits into two: add `CONSULTANT`
--    at rank 15 and give `ADMIN` org-wide reach. The assignment table survives that
--    change unchanged, which is part of why this is a safe direction to start from."
--
-- ADR-013 gave ADMIN organization-wide administrative reach — the second half. This is
-- the first half, arriving later and under a different name. TRAINER is that CONSULTANT.
--
-- The gap ADR-013 left is that every ADMIN could administer the whole organization, so
-- there was no way to describe somebody who works a caseload and administers nothing.
-- TRAINER and STAFF are that person. Both have `canManageOrganization` false and reach
-- member data only through `consultant_assignments`, exactly as an ADMIN does.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- ADDITIVE ONLY. NOTHING IS READ, NOTHING IS WRITTEN, NOTHING IS BACKFILLED.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- This migration adds two enum labels and does nothing else. No existing row changes
-- role; no account gains or loses a capability; every ADMIN and USER in production is
-- exactly what it was before. An unused enum label is inert.
--
-- That matters because the roles are provisioned by an administrator through the product
-- from now on, not by a data migration. There is no correct automatic answer to "which of
-- your existing admins is really a trainer", and guessing would silently strip somebody's
-- ability to administer their own organization.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- WHY THE LABELS ARE NOT USED IN THIS FILE
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- The migration runner wraps each file in ONE transaction, and PostgreSQL refuses to use
-- a new enum label before the transaction that added it commits (CLAUDE.md invariant 6,
-- ADR-006). So a statement here that inserted, compared against, or defaulted to
-- 'TRAINER' would fail at runtime — not at review.
--
-- Nothing in this file needs to. Any future migration that wants to reference these
-- labels — a CHECK constraint, a backfill, a partial index — belongs in 012 or later.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- PostgreSQL cannot remove a value from an enum type, so this is forward-only like every
-- other migration here (ADR-006). It is also close to costless to leave: an unused label
-- constrains nothing and appears nowhere. Reversing the FEATURE means removing the roles
-- from `TENANT_ROLES` in the application, after which no row can be created holding one.
--
-- Recovering from having granted the roles is ordinary product work — an administrator
-- changes those people's role back — not a schema operation.

ALTER TYPE tenant_role ADD VALUE IF NOT EXISTS 'TRAINER';
ALTER TYPE tenant_role ADD VALUE IF NOT EXISTS 'STAFF';

COMMENT ON TYPE tenant_role IS
  'Tenant role ladder: ADMIN(20) > TRAINER(15) > STAFF(12) > USER(10). '
  'ORG_OWNER and CUSTOMER are ADR-013 tombstones, kept because PostgreSQL cannot remove '
  'an enum label. Rank governs who may act on and grant roles to whom; every other '
  'capability is an explicit permission in src/server/authorization/permissions.ts.';
