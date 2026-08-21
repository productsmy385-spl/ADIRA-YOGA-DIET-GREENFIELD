-- 001_foundation.sql
--
-- Organizations, the two identity domains, sessions, consultant assignments, the async
-- job queue, and the audit log.
--
-- This migration establishes the tenancy boundary. Everything added in later phases —
-- yoga programmes, diet plans, activities, reports — hangs off `organizations` and
-- inherits the isolation rules set here, so the shapes below are load-bearing.
--
-- THE CENTRAL IDEA
--
-- There are two kinds of principal and they live in two different tables:
--
--   owner_accounts   the operator of Adira itself. NO organization_id column. That
--                    absence is the platform boundary — you cannot accidentally scope a
--                    platform account to a tenant, because there is nowhere to put the
--                    value.
--
--   users            people inside one wellness organization. organization_id NOT NULL.
--                    You cannot accidentally create an unscoped tenant user, because
--                    the column will not accept NULL.
--
-- Modelling this as one table with a nullable organization_id and an is_platform flag
-- would make both mistakes representable, and would mean every query in the system
-- carries a condition that is easy to omit and invisible when omitted.
--
-- See decisions/ADR-001.


-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------
-- NOTE for future migrations: the runner wraps each file in ONE transaction, and
-- PostgreSQL forbids *using* an enum value added by `ALTER TYPE ... ADD VALUE` until
-- that transaction commits. So: add a value in one migration, use it in a later one.
-- Creating a type and using it in the same migration (as below) is fine — the
-- restriction applies only to ALTER.

CREATE TYPE identity_domain AS ENUM ('PLATFORM', 'TENANT');

CREATE TYPE tenant_role AS ENUM ('ORG_OWNER', 'ADMIN', 'CUSTOMER');

-- ADMIN is the combined admin/consultant role (ADR-002) and is assignment-scoped:
-- it reaches the customers listed in consultant_assignments, not the whole organization.

CREATE TYPE account_status AS ENUM (
  'INVITED',    -- created by staff, has never signed in
  'PENDING',    -- self-registered via join code, awaiting approval
  'ACTIVE',     -- may hold a session
  'SUSPENDED',  -- temporarily barred, reversible by staff
  'LOCKED',     -- automatic, from repeated failed authentication
  'DISABLED'    -- permanently barred
);

CREATE TYPE organization_status AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

CREATE TYPE job_status AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD');


-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
-- A trigger rather than an application convention, because "every write path remembers
-- to set updated_at" is a promise that holds until the first one that forgets.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ---------------------------------------------------------------------------
-- organizations — the tenant root
-- ---------------------------------------------------------------------------

CREATE TABLE organizations (
  id          uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text                NOT NULL CHECK (length(trim(name)) > 0),
  slug        text                NOT NULL UNIQUE
                                  CHECK (slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),

  -- Out-of-band code that lets a person self-register into this organization.
  -- NULL by default and globally unique when set: signup targets a tenant by code,
  -- never by choosing from a public list of organizations. A public dropdown would
  -- publish the customer list and let anyone queue a PENDING row against any tenant
  -- they can see. NULL default means this migration opens no signup route — each
  -- organization turns it on deliberately.
  join_code   text                UNIQUE
                                  CHECK (join_code IS NULL OR length(join_code) >= 8),

  status      organization_status NOT NULL DEFAULT 'ACTIVE',
  timezone    text                NOT NULL DEFAULT 'Asia/Kolkata',
  locale      text                NOT NULL DEFAULT 'en',

  created_at  timestamptz         NOT NULL DEFAULT now(),
  updated_at  timestamptz         NOT NULL DEFAULT now()
);

CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- owner_accounts — the PLATFORM identity domain
-- ---------------------------------------------------------------------------
-- Deliberately has no organization_id. Bootstrapped by a separate seed script, never
-- through the tenant surface.

CREATE TABLE owner_accounts (
  id          uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text           NOT NULL UNIQUE CHECK (email = lower(email)),
  full_name   text           NOT NULL CHECK (length(trim(full_name)) > 0),
  status      account_status NOT NULL DEFAULT 'INVITED',

  created_at  timestamptz    NOT NULL DEFAULT now(),
  updated_at  timestamptz    NOT NULL DEFAULT now()
);

CREATE TRIGGER owner_accounts_set_updated_at
  BEFORE UPDATE ON owner_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- users — the TENANT identity domain
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id               uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid           NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,

  email            text           NOT NULL CHECK (email = lower(email)),
  phone            text,
  full_name        text           NOT NULL CHECK (length(trim(full_name)) > 0),
  role             tenant_role    NOT NULL,
  status           account_status NOT NULL DEFAULT 'INVITED',

  locale           text           NOT NULL DEFAULT 'en',
  last_seen_at     timestamptz,

  created_at       timestamptz    NOT NULL DEFAULT now(),
  updated_at       timestamptz    NOT NULL DEFAULT now(),

  -- Email is unique PER ORGANIZATION, not globally. The same person can legitimately be
  -- a customer of one wellness studio and a consultant at another; a global unique
  -- constraint would make the second relationship unrepresentable, and would also leak
  -- the existence of an account across tenant boundaries at signup time.
  CONSTRAINT users_email_unique_per_org UNIQUE (organization_id, email),

  -- Redundant against the primary key, but required as the target of the composite
  -- foreign keys below. This is what lets PostgreSQL itself refuse a cross-tenant row.
  CONSTRAINT users_id_org_unique UNIQUE (id, organization_id)
);

-- Org-scoped queries lead with organization_id, so indexes do too.
CREATE INDEX users_org_role_status_idx ON users (organization_id, role, status);
CREATE INDEX users_org_created_idx ON users (organization_id, created_at DESC);

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Exactly one ORG_OWNER per organization. A partial unique index is the cheapest place
-- to state this; enforcing it in application code invites a race between two concurrent
-- promotions.
CREATE UNIQUE INDEX users_one_org_owner_idx
  ON users (organization_id)
  WHERE role = 'ORG_OWNER';


-- ---------------------------------------------------------------------------
-- consultant_assignments — which ADMIN serves which CUSTOMER
-- ---------------------------------------------------------------------------
-- ADR-002 makes ADMIN assignment-scoped rather than org-wide, so this table is the
-- difference between "an admin may read this health record" and "may not".

CREATE TABLE consultant_assignments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  consultant_id    uuid        NOT NULL,
  customer_id      uuid        NOT NULL,

  assigned_at      timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- Composite foreign keys including organization_id. This is the important part: the
  -- database now refuses to link a consultant in one organization to a customer in
  -- another, whatever the application layer believes. Cross-tenant leakage through this
  -- table is not a bug we have to remember to test for — it is unrepresentable.
  CONSTRAINT consultant_assignments_consultant_fk
    FOREIGN KEY (consultant_id, organization_id)
    REFERENCES users (id, organization_id) ON DELETE CASCADE,

  CONSTRAINT consultant_assignments_customer_fk
    FOREIGN KEY (customer_id, organization_id)
    REFERENCES users (id, organization_id) ON DELETE CASCADE,

  CONSTRAINT consultant_assignments_distinct CHECK (consultant_id <> customer_id)
);

-- One live assignment per pair. Ended assignments are kept for history, so the
-- uniqueness applies only while ended_at IS NULL.
CREATE UNIQUE INDEX consultant_assignments_active_idx
  ON consultant_assignments (organization_id, consultant_id, customer_id)
  WHERE ended_at IS NULL;

CREATE INDEX consultant_assignments_customer_idx
  ON consultant_assignments (organization_id, customer_id)
  WHERE ended_at IS NULL;

CREATE TRIGGER consultant_assignments_set_updated_at
  BEFORE UPDATE ON consultant_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- sessions — TENANT domain
-- ---------------------------------------------------------------------------
-- Server-side sessions. The cookie carries an opaque token; only its hash is stored, so
-- a database disclosure does not hand over live sessions.

CREATE TABLE sessions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL,
  organization_id  uuid        NOT NULL,

  token_hash       bytea       NOT NULL UNIQUE,

  issued_at        timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  last_used_at     timestamptz NOT NULL DEFAULT now(),
  revoked_at       timestamptz,

  ip               inet,
  user_agent       text,

  -- Denormalising organization_id onto the session is what lets authorization read
  -- tenant scope straight from the authenticated session (ADR-004) without a join, and
  -- the composite FK below keeps it honest against the user's real organization.
  CONSTRAINT sessions_user_fk
    FOREIGN KEY (user_id, organization_id)
    REFERENCES users (id, organization_id) ON DELETE CASCADE,

  CONSTRAINT sessions_expiry_after_issue CHECK (expires_at > issued_at)
);

CREATE INDEX sessions_user_idx ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_expiry_idx ON sessions (expires_at) WHERE revoked_at IS NULL;


-- ---------------------------------------------------------------------------
-- owner_sessions — PLATFORM domain
-- ---------------------------------------------------------------------------
-- A separate table, a separate cookie name, and a separate signing secret. There is no
-- column here that could hold a tenant, and no column on `sessions` that could hold a
-- platform account, so no code path can upgrade one into the other.

CREATE TABLE owner_sessions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_account_id  uuid        NOT NULL REFERENCES owner_accounts(id) ON DELETE CASCADE,

  token_hash        bytea       NOT NULL UNIQUE,

  issued_at         timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  last_used_at      timestamptz NOT NULL DEFAULT now(),
  revoked_at        timestamptz,

  ip                inet,
  user_agent        text,

  CONSTRAINT owner_sessions_expiry_after_issue CHECK (expires_at > issued_at)
);

CREATE INDEX owner_sessions_account_idx
  ON owner_sessions (owner_account_id) WHERE revoked_at IS NULL;
CREATE INDEX owner_sessions_expiry_idx
  ON owner_sessions (expires_at) WHERE revoked_at IS NULL;


-- ---------------------------------------------------------------------------
-- jobs — asynchronous work (ADR-003)
-- ---------------------------------------------------------------------------
-- A Postgres queue drained by Railway Cron hitting /api/cron/*. No worker service and no
-- Redis: one datastore, one deploy, and a job's state is visible to the same SQL as
-- everything else.

CREATE TABLE jobs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULL for platform-level work (organization-spanning reports, housekeeping).
  organization_id  uuid        REFERENCES organizations(id) ON DELETE CASCADE,

  type             text        NOT NULL CHECK (length(trim(type)) > 0),
  payload          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status           job_status  NOT NULL DEFAULT 'QUEUED',

  run_after        timestamptz NOT NULL DEFAULT now(),
  attempts         integer     NOT NULL DEFAULT 0,
  max_attempts     integer     NOT NULL DEFAULT 5 CHECK (max_attempts > 0),

  locked_at        timestamptz,
  locked_by        text,
  last_error       text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz
);

-- The drain query is:
--   SELECT ... FROM jobs
--    WHERE status = 'QUEUED' AND run_after <= now()
--    ORDER BY run_after
--    FOR UPDATE SKIP LOCKED LIMIT $1
-- SKIP LOCKED is what allows two overlapping cron invocations to drain the same queue
-- without either blocking or double-processing a row.
CREATE INDEX jobs_claimable_idx
  ON jobs (run_after)
  WHERE status = 'QUEUED';

CREATE INDEX jobs_org_status_idx ON jobs (organization_id, status, created_at DESC);

CREATE TRIGGER jobs_set_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- audit_logs — append only
-- ---------------------------------------------------------------------------
-- Records WHO did WHAT to WHICH resource. Never records secrets: no OTP values, no
-- session tokens, no credentials. `metadata` is reviewed at every call site for that.
--
-- There is deliberately no updated_at and no update path. An audit trail that can be
-- edited is not an audit trail.

CREATE TABLE audit_logs (
  id               bigserial       PRIMARY KEY,

  organization_id  uuid            REFERENCES organizations(id) ON DELETE SET NULL,

  actor_domain     identity_domain NOT NULL,
  actor_id         uuid,            -- NULL for unauthenticated events (failed sign-in)
  actor_label      text,            -- denormalised for readability after the actor is gone

  action           text            NOT NULL CHECK (length(trim(action)) > 0),
  resource_type    text,
  resource_id      text,

  outcome          text            NOT NULL DEFAULT 'SUCCESS'
                                   CHECK (outcome IN ('SUCCESS', 'FAILURE', 'DENIED')),
  metadata         jsonb           NOT NULL DEFAULT '{}'::jsonb,

  ip               inet,
  user_agent       text,

  created_at       timestamptz     NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_org_time_idx ON audit_logs (organization_id, created_at DESC);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_domain, actor_id, created_at DESC);
CREATE INDEX audit_logs_action_idx ON audit_logs (action, created_at DESC);

-- DENIED outcomes are the security signal worth watching: a cross-tenant probe or a
-- privilege-escalation attempt lands here. Small partial index, cheap to scan.
CREATE INDEX audit_logs_denied_idx
  ON audit_logs (created_at DESC)
  WHERE outcome = 'DENIED';
