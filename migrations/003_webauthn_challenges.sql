-- 003_webauthn_challenges.sql
--
-- Server-side storage for in-flight WebAuthn ceremonies.
--
-- WHY THIS TABLE HAS TO EXIST
--
-- A WebAuthn ceremony is two round trips. The server issues a random challenge, the
-- authenticator signs it, and the server verifies that the signature covers *the
-- challenge it issued*. That last part is the whole security property: without it, a
-- replayed assertion from a previous login is indistinguishable from a fresh one.
--
-- So the challenge must be remembered between the two requests, and it must be
-- remembered somewhere the client cannot edit. A cookie would be client-held; a module
-- variable would not survive more than one server instance. It belongs in the database.
--
-- THE PRINCIPAL MAY BE UNKNOWN
--
-- Unlike `otp_challenges`, the principal columns here are NULLABLE, and that is not an
-- oversight. Passkeys support a discoverable-credential ("usernameless") flow: the user
-- clicks Sign in, the browser offers whichever passkey it holds for this site, and the
-- server does not learn who they are until the assertion comes back carrying a
-- credential id. The challenge has to be issued *before* that.
--
-- Registration always knows its principal; authentication may not. One table serves both
-- because the lifecycle — issue, verify once, expire — is identical.

CREATE TYPE webauthn_ceremony AS ENUM ('REGISTRATION', 'AUTHENTICATION');

CREATE TABLE webauthn_challenges (
  id                 uuid              PRIMARY KEY DEFAULT gen_random_uuid(),

  ceremony           webauthn_ceremony NOT NULL,

  -- The random value the authenticator must sign. Stored raw rather than hashed: unlike
  -- an OTP or a session token, this is not a secret the holder proves knowledge of. It
  -- is a nonce the server must compare against what came back, so it needs to be
  -- readable. Its security comes from being unguessable and single-use, not from being
  -- concealed — an attacker who reads it still cannot produce a signature over it.
  challenge          bytea             NOT NULL,

  -- NULL during a discoverable-credential authentication, where the principal is not
  -- known until the assertion returns. Always populated for registration.
  user_id            uuid              REFERENCES users(id) ON DELETE CASCADE,
  owner_account_id   uuid              REFERENCES owner_accounts(id) ON DELETE CASCADE,
  organization_id    uuid              REFERENCES organizations(id) ON DELETE CASCADE,

  expires_at         timestamptz       NOT NULL,
  consumed_at        timestamptz,

  created_at         timestamptz       NOT NULL DEFAULT now(),

  ip                 inet,
  user_agent         text,

  -- At most one principal, and never both. Registration must name one; authentication
  -- may name none. This is the same ADR-001 boundary as `passkey_credentials`, relaxed
  -- only where the protocol genuinely cannot know the answer yet.
  CONSTRAINT webauthn_principal_shape CHECK (
    (user_id IS NOT NULL AND owner_account_id IS NULL AND organization_id IS NOT NULL)
    OR
    (user_id IS NULL AND owner_account_id IS NOT NULL AND organization_id IS NULL)
    OR
    (user_id IS NULL AND owner_account_id IS NULL AND organization_id IS NULL
       AND ceremony = 'AUTHENTICATION')
  ),

  -- A tenant principal's organization must be their own.
  CONSTRAINT webauthn_user_fk
    FOREIGN KEY (user_id, organization_id)
    REFERENCES users (id, organization_id) ON DELETE CASCADE
);

-- The verification lookup. Partial on unconsumed rows because a consumed challenge is
-- history, and the hot path only ever asks about live ones.
CREATE INDEX webauthn_live_idx
  ON webauthn_challenges (expires_at)
  WHERE consumed_at IS NULL;

CREATE INDEX webauthn_user_idx
  ON webauthn_challenges (user_id, created_at DESC)
  WHERE consumed_at IS NULL;

CREATE INDEX webauthn_owner_idx
  ON webauthn_challenges (owner_account_id, created_at DESC)
  WHERE consumed_at IS NULL;
