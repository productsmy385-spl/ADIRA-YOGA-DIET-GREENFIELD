/**
 * Session persistence for both identity domains.
 *
 * Two tables, two functions of each kind, and deliberately no shared
 * `createSession(domain)` helper. A single function parameterised over both domains
 * would put the choice of table behind a runtime value, and ADR-001's whole point is
 * that no code path can slide a tenant principal into the platform domain. Keeping them
 * separate makes that mistake require calling a visibly different function.
 *
 * Tokens never appear here. The caller generates one with `generateSessionToken()`,
 * hands the hash to this layer, and returns the plaintext to the browser exactly once.
 * There is no column and no argument that could carry the plaintext, so it cannot be
 * stored by accident.
 */

import { query, queryOne } from "@/server/db/pool";
import type { TenantRoleValue } from "@/server/db/types";
import { normaliseRole, type StoredTenantRole, type TenantRole } from "@/server/authorization/roles";

/**
 * What a verified tenant cookie resolves to.
 *
 * `organizationId` is the tenant scope every org-scoped repository requires (ADR-004).
 * It comes from the session row, which the composite foreign key in 001_foundation.sql
 * keeps consistent with the user's real organization — so this value cannot disagree
 * with the database even if the session row were tampered with.
 */
export interface TenantSessionContext {
  sessionId: string;
  userId: string;
  organizationId: string;
  /**
   * The merged model (ADR-013). Legacy labels are normalised here, once, so that no
   * business logic above this layer ever compares against ORG_OWNER or CUSTOMER.
   */
  role: TenantRole;
  /**
   * What `users.role` actually holds, when it differs from `role`.
   *
   * Carried through the session because the transitional grandfather clause in
   * `canAccessMemberData` needs it, and reading it from the session is the only place it
   * can be trusted — a request parameter could claim anything (ADR-004).
   */
  storedRole?: StoredTenantRole;
  email: string;
  fullName: string;
  locale: string;
  issuedAt: Date;
  expiresAt: Date;
  lastUsedAt: Date;
  organizationName: string;
  organizationSlug: string;
}

export interface PlatformSessionContext {
  sessionId: string;
  ownerAccountId: string;
  email: string;
  fullName: string;
  issuedAt: Date;
  expiresAt: Date;
  lastUsedAt: Date;
}

export interface NewSession {
  tokenHash: Buffer;
  expiresAt: Date;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Status is part of the authenticating query, not a check that runs after it.
 *
 * A SUSPENDED user, or a user whose organization was suspended, cannot hold a live
 * session *by construction* — the row simply does not come back. Suspension therefore
 * takes effect on the very next request, with no revocation sweep to run and no window
 * during which the check might be skipped on some other code path.
 *
 * `expires_at > now()` is evaluated by PostgreSQL against the indexed column, so an
 * expired session never leaves the database.
 */
const TENANT_SESSION_SELECT = `
  SELECT s.id            AS session_id,
         s.user_id       AS user_id,
         s.organization_id,
         s.issued_at,
         s.expires_at,
         s.last_used_at,
         u.role,
         u.email,
         u.full_name,
         u.locale,
         o.name          AS organization_name,
         o.slug          AS organization_slug
    FROM sessions s
    JOIN users u
      ON u.id = s.user_id
     AND u.organization_id = s.organization_id
    JOIN organizations o
      ON o.id = s.organization_id
   WHERE s.token_hash = $1
     AND s.revoked_at IS NULL
     AND s.expires_at > now()
     AND u.status = 'ACTIVE'
     AND o.status = 'ACTIVE'
`;

interface TenantSessionRow {
  session_id: string;
  user_id: string;
  organization_id: string;
  issued_at: Date;
  expires_at: Date;
  last_used_at: Date;
  role: TenantRoleValue;
  email: string;
  full_name: string;
  locale: string;
  organization_name: string;
  organization_slug: string;
}

function toTenantContext(row: TenantSessionRow): TenantSessionContext {
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    organizationId: row.organization_id,
    role: normaliseRole(row.role as StoredTenantRole),
    ...(normaliseRole(row.role as StoredTenantRole) !== (row.role as string)
      ? { storedRole: row.role as StoredTenantRole }
      : {}),
    email: row.email,
    fullName: row.full_name,
    locale: row.locale,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
  };
}

export async function createTenantSession(
  userId: string,
  organizationId: string,
  session: NewSession,
): Promise<{ sessionId: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO sessions
       (user_id, organization_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      userId,
      organizationId,
      session.tokenHash,
      session.expiresAt,
      session.ip ?? null,
      session.userAgent ?? null,
    ],
  );

  // RETURNING on a successful INSERT always yields a row; a null here means the insert
  // did not happen, which is a bug rather than a "not found".
  if (!row) throw new Error("createTenantSession: insert returned no row");
  return { sessionId: row.id };
}

export async function findTenantSessionByTokenHash(
  tokenHash: Buffer,
): Promise<TenantSessionContext | null> {
  const row = await queryOne<TenantSessionRow>(TENANT_SESSION_SELECT, [tokenHash]);
  return row ? toTenantContext(row) : null;
}

/**
 * Record activity on a session.
 *
 * Rate-limited by the caller through `shouldTouch` — see session-policy.ts for why every
 * request must not write here.
 */
export async function touchTenantSession(sessionId: string): Promise<void> {
  await query(`UPDATE sessions SET last_used_at = now() WHERE id = $1`, [sessionId]);
}

/**
 * Revoke one session. Idempotent: `revoked_at IS NULL` in the WHERE clause means a
 * second sign-out does not rewrite the original revocation time.
 */
export async function revokeTenantSession(sessionId: string): Promise<void> {
  await query(
    `UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`,
    [sessionId],
  );
}

/**
 * Revoke every live session for a user — "sign out everywhere", and the action to take
 * when a passkey is removed or an account is suspended.
 *
 * `organizationId` is required and part of the predicate even though `userId` alone
 * would identify the rows. Every org-scoped statement in this codebase carries the
 * tenant scope (ADR-004); an exception "because the id is unique anyway" is how the
 * habit erodes.
 */
export async function revokeAllTenantSessions(
  userId: string,
  organizationId: string,
): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE sessions
        SET revoked_at = now()
      WHERE user_id = $1
        AND organization_id = $2
        AND revoked_at IS NULL
      RETURNING id`,
    [userId, organizationId],
  );
  return rows.length;
}

// ---------------------------------------------------------------------------
// Platform domain
// ---------------------------------------------------------------------------

const PLATFORM_SESSION_SELECT = `
  SELECT s.id               AS session_id,
         s.owner_account_id,
         s.issued_at,
         s.expires_at,
         s.last_used_at,
         a.email,
         a.full_name
    FROM owner_sessions s
    JOIN owner_accounts a ON a.id = s.owner_account_id
   WHERE s.token_hash = $1
     AND s.revoked_at IS NULL
     AND s.expires_at > now()
     AND a.status = 'ACTIVE'
`;

interface PlatformSessionRow {
  session_id: string;
  owner_account_id: string;
  issued_at: Date;
  expires_at: Date;
  last_used_at: Date;
  email: string;
  full_name: string;
}

export async function createPlatformSession(
  ownerAccountId: string,
  session: NewSession,
): Promise<{ sessionId: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO owner_sessions
       (owner_account_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      ownerAccountId,
      session.tokenHash,
      session.expiresAt,
      session.ip ?? null,
      session.userAgent ?? null,
    ],
  );

  if (!row) throw new Error("createPlatformSession: insert returned no row");
  return { sessionId: row.id };
}

export async function findPlatformSessionByTokenHash(
  tokenHash: Buffer,
): Promise<PlatformSessionContext | null> {
  const row = await queryOne<PlatformSessionRow>(PLATFORM_SESSION_SELECT, [tokenHash]);
  if (!row) return null;

  return {
    sessionId: row.session_id,
    ownerAccountId: row.owner_account_id,
    email: row.email,
    fullName: row.full_name,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
  };
}

export async function touchPlatformSession(sessionId: string): Promise<void> {
  await query(`UPDATE owner_sessions SET last_used_at = now() WHERE id = $1`, [sessionId]);
}

export async function revokePlatformSession(sessionId: string): Promise<void> {
  await query(
    `UPDATE owner_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`,
    [sessionId],
  );
}

export async function revokeAllPlatformSessions(ownerAccountId: string): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE owner_sessions
        SET revoked_at = now()
      WHERE owner_account_id = $1
        AND revoked_at IS NULL
      RETURNING id`,
    [ownerAccountId],
  );
  return rows.length;
}

/**
 * Delete sessions that expired long enough ago to be worthless.
 *
 * Revoked and expired rows are kept for a grace period rather than deleted immediately,
 * because "when did this session end" is a question incident response asks. Called by
 * the housekeeping cron in Phase 11.
 */
export async function deleteExpiredSessions(olderThan: Date): Promise<number> {
  const tenant = await query<{ id: string }>(
    `DELETE FROM sessions WHERE expires_at < $1 RETURNING id`,
    [olderThan],
  );
  const platform = await query<{ id: string }>(
    `DELETE FROM owner_sessions WHERE expires_at < $1 RETURNING id`,
    [olderThan],
  );
  return tenant.length + platform.length;
}
