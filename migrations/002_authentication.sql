-- 002_authentication.sql
--
-- Passkey credentials, OTP challenges, and authentication rate limiting.
--
-- Sessions already exist in 001_foundation.sql, because a session is a tenancy construct
-- as much as an authentication one. This migration adds the things that *establish* a
-- session.
--
-- THE RULE THIS SCHEMA ENFORCES
--
-- Nothing here stores a secret in a form that is useful to whoever reads the table.
-- Passkeys store a public key — that is the entire point of the mechanism. OTP stores a
-- hash of the code, never the code. Sessions (in 001) store a hash of the token.
--
-- A database disclosure should cost the operator their data, not additionally hand the
-- attacker a working set of credentials.
--
-- Both identity domains are served. `passkey_credentials` and `otp_challenges` each
-- reference EITHER a tenant user OR a platform owner account, never both, enforced by a
-- CHECK. Modelling this as one nullable pair with a constraint keeps ADR-001's boundary
-- visible in the schema rather than delegating it to application code.


-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------

-- Why an OTP was issued. Determines expiry, attempt budget, and what verifying it
-- entitles the caller to do — a code issued to recover an account must not be
-- replayable as a step-up approval for a destructive action.
CREATE TYPE otp_purpose AS ENUM (
  'ACCOUNT_ACTIVATION',
  'ACCOUNT_RECOVERY',
  'NEW_DEVICE',
  'STEP_UP'
);

CREATE TYPE otp_status AS ENUM (
  'PENDING',    -- issued, unused, unexpired
  'VERIFIED',   -- consumed; a second verification must fail
  'EXPIRED',
  'EXHAUSTED',  -- attempt budget spent
  'SUPERSEDED'  -- a newer challenge replaced it
);


-- ---------------------------------------------------------------------------
-- passkey_credentials
-- ---------------------------------------------------------------------------
-- One row per registered authenticator. A person may hold several — a phone, a laptop,
-- a hardware key — and revoking one must not lock them out of the others.

CREATE TABLE passkey_credentials (
  id                 uuid            PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Exactly one of these is set. See the CHECK below.
  user_id            uuid            REFERENCES users(id) ON DELETE CASCADE,
  owner_account_id   uuid            REFERENCES owner_accounts(id) ON DELETE CASCADE,

  -- Denormalised for tenant-scoped queries; NULL for platform accounts, which have no
  -- organization by construction (ADR-001).
  organization_id    uuid            REFERENCES organizations(id) ON DELETE CASCADE,

  -- The authenticator's credential ID, as returned by the browser. Globally unique:
  -- the same authenticator must not be registrable twice, in this or any tenant.
  credential_id      bytea           NOT NULL UNIQUE,

  -- The PUBLIC key. There is no private key here and no way to derive one. This is why
  -- passkeys are preferred over passwords: the server's copy is not worth stealing.
  public_key         bytea           NOT NULL,

  -- Replay protection. An authenticator reports a monotonically increasing counter;
  -- a value that fails to advance suggests a cloned credential. Some authenticators
  -- legitimately always report 0, so this is a signal to record, not an absolute rule.
  counter            bigint          NOT NULL DEFAULT 0,

  transports         text[]          NOT NULL DEFAULT '{}',
  device_type        text,
  backed_up          boolean         NOT NULL DEFAULT false,

  -- Human-chosen label ("Pixel 8", "YubiKey"), so a person revoking a lost device can
  -- tell which row is the lost device.
  label              text,

  created_at         timestamptz     NOT NULL DEFAULT now(),
  last_used_at       timestamptz,
  revoked_at         timestamptz,

  -- Exactly one principal, never zero and never both. This is ADR-001 expressed as a
  -- constraint: a credential cannot straddle the two identity domains.
  CONSTRAINT passkey_one_principal CHECK (
    (user_id IS NOT NULL AND owner_account_id IS NULL AND organization_id IS NOT NULL)
    OR
    (user_id IS NULL AND owner_account_id IS NOT NULL AND organization_id IS NULL)
  ),

  -- Where a tenant user is the principal, the organization must be *their* organization.
  CONSTRAINT passkey_user_fk
    FOREIGN KEY (user_id, organization_id)
    REFERENCES users (id, organization_id) ON DELETE CASCADE
);

CREATE INDEX passkey_user_idx
  ON passkey_credentials (user_id) WHERE revoked_at IS NULL;
CREATE INDEX passkey_owner_idx
  ON passkey_credentials (owner_account_id) WHERE revoked_at IS NULL;


-- ---------------------------------------------------------------------------
-- otp_challenges
-- ---------------------------------------------------------------------------

CREATE TABLE otp_challenges (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id            uuid          REFERENCES users(id) ON DELETE CASCADE,
  owner_account_id   uuid          REFERENCES owner_accounts(id) ON DELETE CASCADE,
  organization_id    uuid          REFERENCES organizations(id) ON DELETE CASCADE,

  purpose            otp_purpose   NOT NULL,
  status             otp_status    NOT NULL DEFAULT 'PENDING',

  -- SHA-256 of the code. The code itself exists only in the delivered email and in the
  -- user's hands. There is deliberately no column that could hold it, so no future
  -- "just log it for debugging" change can quietly introduce one.
  code_hash          bytea         NOT NULL,

  -- Where it was sent, recorded so a support conversation can establish which address
  -- received a code without anyone needing to know the code.
  destination        text          NOT NULL,

  attempts           integer       NOT NULL DEFAULT 0,
  max_attempts       integer       NOT NULL DEFAULT 5 CHECK (max_attempts > 0),

  expires_at         timestamptz   NOT NULL,
  verified_at        timestamptz,
  created_at         timestamptz   NOT NULL DEFAULT now(),

  ip                 inet,
  user_agent         text,

  CONSTRAINT otp_one_principal CHECK (
    (user_id IS NOT NULL AND owner_account_id IS NULL AND organization_id IS NOT NULL)
    OR
    (user_id IS NULL AND owner_account_id IS NOT NULL AND organization_id IS NULL)
  ),

  CONSTRAINT otp_user_fk
    FOREIGN KEY (user_id, organization_id)
    REFERENCES users (id, organization_id) ON DELETE CASCADE,

  CONSTRAINT otp_verified_consistency CHECK (
    (status = 'VERIFIED') = (verified_at IS NOT NULL)
  )
);

-- The verification lookup: find this principal's live challenge for this purpose.
CREATE INDEX otp_live_user_idx
  ON otp_challenges (user_id, purpose, created_at DESC)
  WHERE status = 'PENDING';

CREATE INDEX otp_live_owner_idx
  ON otp_challenges (owner_account_id, purpose, created_at DESC)
  WHERE status = 'PENDING';

-- Housekeeping: expired challenges are swept by a cron job.
CREATE INDEX otp_expiry_idx ON otp_challenges (expires_at) WHERE status = 'PENDING';


-- ---------------------------------------------------------------------------
-- auth_attempts — rate limiting and brute-force protection
-- ---------------------------------------------------------------------------
-- Deliberately in PostgreSQL rather than Redis, consistent with ADR-003: one datastore.
-- A rate limiter in a second system is a second system that can be down, and a limiter
-- that fails open is not a limiter.
--
-- Rows are counted within a time window, not decremented from a bucket, so a concurrent
-- burst cannot race the counter below the true value.

CREATE TABLE auth_attempts (
  id          bigserial   PRIMARY KEY,

  -- What is being limited. Two dimensions are recorded independently so that neither is
  -- a way around the other: limiting only by account lets an attacker spray many
  -- accounts from one host; limiting only by IP lets a distributed attacker through.
  scope       text        NOT NULL CHECK (scope IN ('ACCOUNT', 'IP')),

  -- Account id, or the IP address, as text. Not a foreign key: an attempt against an
  -- address that has no account must still be counted, or the limiter is blind to
  -- exactly the enumeration it should be stopping.
  subject     text        NOT NULL,

  action      text        NOT NULL,   -- 'otp.issue', 'otp.verify', 'passkey.authenticate'
  successful  boolean     NOT NULL,

  created_at  timestamptz NOT NULL DEFAULT now()
);

-- The limiter's only query: how many attempts for this subject and action since T?
CREATE INDEX auth_attempts_window_idx
  ON auth_attempts (scope, subject, action, created_at DESC);

-- Swept by cron; rows older than the longest window are worthless.
CREATE INDEX auth_attempts_sweep_idx ON auth_attempts (created_at);
