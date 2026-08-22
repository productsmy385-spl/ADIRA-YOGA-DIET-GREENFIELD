/**
 * Registered passkeys, for both identity domains (ADR-001).
 *
 * A row here holds a PUBLIC key. There is no private key in this table and no way to
 * derive one — that is the property that makes passkeys worth preferring over passwords:
 * the server's copy is not worth stealing.
 *
 * Every function takes the principal explicitly and never infers it. A lookup by
 * credential id alone returns the row *and its owner*, so the caller must then check
 * that owner against the session it holds — see `findCredentialById`.
 */

import { query, queryOne } from "@/server/db/pool";

export interface PasskeyCredential {
  id: string;
  /** Set for a tenant user; null for a platform account. Exactly one of the two. */
  userId: string | null;
  ownerAccountId: string | null;
  organizationId: string | null;
  credentialId: Buffer;
  publicKey: Buffer;
  counter: number;
  transports: string[];
  deviceType: string | null;
  backedUp: boolean;
  label: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

interface PasskeyRow {
  id: string;
  user_id: string | null;
  owner_account_id: string | null;
  organization_id: string | null;
  credential_id: Buffer;
  public_key: Buffer;
  counter: string;
  transports: string[];
  device_type: string | null;
  backed_up: boolean;
  label: string | null;
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
}

const COLUMNS = `
  id, user_id, owner_account_id, organization_id, credential_id, public_key,
  counter, transports, device_type, backed_up, label,
  created_at, last_used_at, revoked_at
`;

function toCredential(row: PasskeyRow): PasskeyCredential {
  return {
    id: row.id,
    userId: row.user_id,
    ownerAccountId: row.owner_account_id,
    organizationId: row.organization_id,
    credentialId: row.credential_id,
    publicKey: row.public_key,
    // `bigint` arrives from node-postgres as a string, because a Postgres bigint can
    // exceed Number.MAX_SAFE_INTEGER. A signature counter never will, so narrowing here
    // is safe — but it has to be deliberate, since `row.counter + 1` on a string
    // silently produces "01".
    counter: Number(row.counter),
    transports: row.transports,
    deviceType: row.device_type,
    backedUp: row.backed_up,
    label: row.label,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

export interface RegisterPasskeyInput {
  userId?: string | null;
  ownerAccountId?: string | null;
  organizationId?: string | null;
  credentialId: Buffer;
  publicKey: Buffer;
  counter: number;
  transports?: string[];
  deviceType?: string | null;
  backedUp?: boolean;
  label?: string | null;
}

export async function registerPasskey(
  input: RegisterPasskeyInput,
): Promise<PasskeyCredential> {
  const row = await queryOne<PasskeyRow>(
    `INSERT INTO passkey_credentials
       (user_id, owner_account_id, organization_id, credential_id, public_key,
        counter, transports, device_type, backed_up, label)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${COLUMNS}`,
    [
      input.userId ?? null,
      input.ownerAccountId ?? null,
      input.organizationId ?? null,
      input.credentialId,
      input.publicKey,
      input.counter,
      input.transports ?? [],
      input.deviceType ?? null,
      input.backedUp ?? false,
      input.label ?? null,
    ],
  );

  // The insert has a RETURNING clause and no ON CONFLICT, so a null row is impossible.
  return toCredential(row!);
}

/**
 * Find a credential by the id the authenticator presented.
 *
 * Deliberately NOT scoped to a principal, because during a discoverable-credential
 * ("usernameless") sign-in the caller does not yet know who is authenticating — the
 * credential id is what reveals it.
 *
 * **The caller must therefore treat the returned owner as untrusted input** until the
 * assertion signature verifies against `publicKey`. Finding a row proves only that this
 * credential was registered by someone, not that the person presenting it is that
 * someone.
 */
export async function findCredentialById(
  credentialId: Buffer,
): Promise<PasskeyCredential | null> {
  const row = await queryOne<PasskeyRow>(
    `SELECT ${COLUMNS} FROM passkey_credentials
      WHERE credential_id = $1 AND revoked_at IS NULL`,
    [credentialId],
  );
  return row ? toCredential(row) : null;
}

/** Every live passkey for a tenant user, scoped by organization (ADR-004). */
export async function listUserPasskeys(
  organizationId: string,
  userId: string,
): Promise<PasskeyCredential[]> {
  const rows = await query<PasskeyRow>(
    `SELECT ${COLUMNS} FROM passkey_credentials
      WHERE organization_id = $1 AND user_id = $2 AND revoked_at IS NULL
      ORDER BY created_at`,
    [organizationId, userId],
  );
  return rows.map(toCredential);
}

export async function listOwnerPasskeys(
  ownerAccountId: string,
): Promise<PasskeyCredential[]> {
  const rows = await query<PasskeyRow>(
    `SELECT ${COLUMNS} FROM passkey_credentials
      WHERE owner_account_id = $1 AND revoked_at IS NULL
      ORDER BY created_at`,
    [ownerAccountId],
  );
  return rows.map(toCredential);
}

/**
 * Advance the signature counter and stamp last use.
 *
 * Guarded by `counter > $2 OR $2 = 0`: an authenticator that legitimately always reports
 * zero (many do) must still update `last_used_at`, while one that reports a real counter
 * must only ever move it forward. A concurrent replay therefore cannot rewind it.
 */
export async function recordPasskeyUse(
  credentialDbId: string,
  newCounter: number,
): Promise<void> {
  await query(
    `UPDATE passkey_credentials
        SET counter = GREATEST(counter, $2), last_used_at = now()
      WHERE id = $1`,
    [credentialDbId, newCounter],
  );
}

/**
 * Revoke one passkey.
 *
 * Scoped to its principal so a caller cannot revoke a credential belonging to someone
 * else by guessing an id — the classic IDOR shape for this kind of endpoint.
 */
export async function revokeUserPasskey(
  organizationId: string,
  userId: string,
  credentialDbId: string,
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE passkey_credentials
        SET revoked_at = now()
      WHERE id = $3 AND organization_id = $1 AND user_id = $2 AND revoked_at IS NULL
      RETURNING id`,
    [organizationId, userId, credentialDbId],
  );
  return rows.length > 0;
}

export async function revokeOwnerPasskey(
  ownerAccountId: string,
  credentialDbId: string,
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE passkey_credentials
        SET revoked_at = now()
      WHERE id = $2 AND owner_account_id = $1 AND revoked_at IS NULL
      RETURNING id`,
    [ownerAccountId, credentialDbId],
  );
  return rows.length > 0;
}

/**
 * How many live passkeys a tenant user holds.
 *
 * Exists so the revoke path can refuse to remove someone's last credential without an
 * alternative — revoking it silently converts "sign in with your phone" into an account
 * recovery ticket.
 */
export async function countUserPasskeys(
  organizationId: string,
  userId: string,
): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT count(*)::text AS count FROM passkey_credentials
      WHERE organization_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [organizationId, userId],
  );
  return Number(row?.count ?? 0);
}
