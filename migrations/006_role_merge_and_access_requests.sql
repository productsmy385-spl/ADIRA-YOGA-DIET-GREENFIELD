-- 006_role_merge_and_access_requests.sql
--
-- ADR-013, deployment 1 of three. ADDITIVE ONLY.
--
-- Nothing here changes a single existing row. That is the entire point: Railway applies
-- migrations while the PREVIOUS container is still serving traffic, so any migration that
-- rewrites data or removes a label breaks the application that is currently running.
--
-- Two independent changes ride together because both are additive and both are needed by
-- the same deployment:
--
--   1. `USER` is added to `tenant_role`. It is NOT used anywhere in this file.
--   2. `access_requests` is created. It touches no existing table.
--
-- WHY 'USER' IS ADDED HERE AND USED NOWHERE
--
-- PostgreSQL forbids *using* an enum label in the same transaction that adds it, and this
-- runner wraps each migration file in exactly one transaction (CLAUDE.md invariant 6,
-- ADR-006). Adding the label here and backfilling in 007 is not tidiness — the combined
-- version simply fails.
--
-- `ORG_OWNER` and `CUSTOMER` are deliberately left in place. PostgreSQL cannot remove an
-- enum value without recreating the type, and the code deployed alongside this migration
-- reads all four labels on purpose.


-- ---------------------------------------------------------------------------
-- The merged role model gains its member label
-- ---------------------------------------------------------------------------
-- After 007 backfills, `tenant_role` effectively means ADMIN | USER. ORG_OWNER and
-- CUSTOMER survive as tombstones until (and unless) deployment 3 recreates the type.

ALTER TYPE tenant_role ADD VALUE IF NOT EXISTS 'USER';


-- ---------------------------------------------------------------------------
-- access_requests
-- ---------------------------------------------------------------------------
-- Someone without access asks for it; an admin decides. Deliberately NOT modelled as a
-- `users` row in a pending state: the brief requires account status and request status to
-- stay separate, and `account_status.PENDING` — "self-registered via join code, awaiting
-- approval" — is exactly the conflation it warns against. That value is now dead and
-- should not be reused.
--
-- No account exists until an admin approves. A rejected request therefore leaves no
-- account behind to be activated later, which is a property worth having rather than a
-- detail of the workflow.

CREATE TYPE access_request_status AS ENUM (
  'PENDING',    -- submitted, awaiting an admin decision
  'APPROVED',   -- an account was created; see audit_logs for by whom
  'REJECTED',   -- declined; no account exists
  'CANCELLED'   -- withdrawn, or superseded
);

CREATE TABLE access_requests (
  id                uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Resolved SERVER-SIDE from the submitted join code. The applicant never supplies an
  -- organization id, and no endpoint returns a list of organizations to an
  -- unauthenticated caller — a public dropdown would publish the tenant list, which is
  -- the reasoning already recorded against `organizations.join_code` in 001 (ADR-013 Q2).
  organization_id   uuid                  NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  full_name         text                  NOT NULL CHECK (length(trim(full_name)) > 0),
  email             text                  NOT NULL CHECK (email = lower(email)),
  phone             text,
  reason            text,

  status            access_request_status NOT NULL DEFAULT 'PENDING',

  -- There is deliberately NO `requested_role` column. The applicant is asking for access,
  -- not for a rank. Approval always creates a USER, and admin provisioning is a separate
  -- privileged workflow (ADR-013). A column that could carry a role is a column that a
  -- future handler could read from the request body.

  reviewed_by       uuid,
  reviewed_at       timestamptz,
  review_notes      text,

  ip                inet,
  user_agent        text,

  created_at        timestamptz           NOT NULL DEFAULT now(),
  updated_at        timestamptz           NOT NULL DEFAULT now(),

  -- The reviewer must belong to the organization the request targets. A composite foreign
  -- key makes a cross-tenant approval unrepresentable, so it cannot be reached by a bug in
  -- the handler — the same technique `consultant_assignments` uses on both its sides.
  CONSTRAINT access_requests_reviewer_fk
    FOREIGN KEY (reviewed_by, organization_id)
    REFERENCES users (id, organization_id) ON DELETE SET NULL,

  -- A decided request must say who decided it and when; an undecided one must not.
  CONSTRAINT access_requests_review_consistency CHECK (
    (status = 'PENDING' AND reviewed_at IS NULL)
    OR (status <> 'PENDING' AND reviewed_at IS NOT NULL)
  )
);

-- ONE open request per address per organization.
--
-- A partial unique index rather than an application check, because the application check
-- races: two submissions arriving together both find nothing and both insert. Restricting
-- it to PENDING is what allows a fresh request after a rejection.
CREATE UNIQUE INDEX access_requests_one_pending_idx
  ON access_requests (organization_id, email)
  WHERE status = 'PENDING';

-- The admin queue: this organization's requests, newest first.
CREATE INDEX access_requests_queue_idx
  ON access_requests (organization_id, status, created_at DESC);

-- Abuse review: everything from one address, across organizations. Reading this is a
-- platform-operator activity, not a tenant one.
CREATE INDEX access_requests_email_idx ON access_requests (email, created_at DESC);

CREATE TRIGGER access_requests_set_updated_at
  BEFORE UPDATE ON access_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
