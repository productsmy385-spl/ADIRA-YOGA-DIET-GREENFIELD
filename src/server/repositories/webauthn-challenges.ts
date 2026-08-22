/**
 * In-flight WebAuthn ceremonies.
 *
 * A challenge is issued, signed by an authenticator, and verified once. The single-use
 * property is enforced here by `consumeChallenge`, which updates conditionally and
 * reports whether it won — so two concurrent verifications of the same challenge cannot
 * both succeed.
 */

import { queryOne } from "@/server/db/pool";
import type { WebauthnCeremonyValue } from "@/server/db/types";

export interface WebauthnChallenge {
  id: string;
  ceremony: WebauthnCeremonyValue;
  challenge: Buffer;
  userId: string | null;
  ownerAccountId: string | null;
  organizationId: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

interface ChallengeRow {
  id: string;
  ceremony: WebauthnCeremonyValue;
  challenge: Buffer;
  user_id: string | null;
  owner_account_id: string | null;
  organization_id: string | null;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
}

const COLUMNS = `
  id, ceremony, challenge, user_id, owner_account_id, organization_id,
  expires_at, consumed_at, created_at
`;

function toChallenge(row: ChallengeRow): WebauthnChallenge {
  return {
    id: row.id,
    ceremony: row.ceremony,
    challenge: row.challenge,
    userId: row.user_id,
    ownerAccountId: row.owner_account_id,
    organizationId: row.organization_id,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    createdAt: row.created_at,
  };
}

export interface CreateChallengeInput {
  ceremony: WebauthnCeremonyValue;
  challenge: Buffer;
  expiresAt: Date;
  userId?: string | null;
  ownerAccountId?: string | null;
  organizationId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export async function createChallenge(
  input: CreateChallengeInput,
): Promise<WebauthnChallenge> {
  const row = await queryOne<ChallengeRow>(
    `INSERT INTO webauthn_challenges
       (ceremony, challenge, expires_at, user_id, owner_account_id, organization_id,
        ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${COLUMNS}`,
    [
      input.ceremony,
      input.challenge,
      input.expiresAt,
      input.userId ?? null,
      input.ownerAccountId ?? null,
      input.organizationId ?? null,
      input.ip ?? null,
      input.userAgent ?? null,
    ],
  );
  return toChallenge(row!);
}

export async function findLiveChallenge(id: string): Promise<WebauthnChallenge | null> {
  // Expiry is part of the SELECT rather than a check afterwards, for the same reason the
  // session lookup filters on account status: a condition applied by the statement that
  // fetches the row cannot be forgotten by a caller.
  const row = await queryOne<ChallengeRow>(
    `SELECT ${COLUMNS} FROM webauthn_challenges
      WHERE id = $1 AND consumed_at IS NULL AND expires_at > now()`,
    [id],
  );
  return row ? toChallenge(row) : null;
}

/**
 * Mark a challenge used. Returns false if it was already consumed or has expired.
 *
 * The `consumed_at IS NULL` predicate lives in the UPDATE, so the database decides the
 * race. Reading first and then updating would leave a window in which two requests both
 * observe an unconsumed challenge and both proceed — which for an authentication
 * ceremony means one replayed assertion succeeding twice.
 */
export async function consumeChallenge(id: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `UPDATE webauthn_challenges
        SET consumed_at = now()
      WHERE id = $1 AND consumed_at IS NULL AND expires_at > now()
      RETURNING id`,
    [id],
  );
  return row !== null;
}

/**
 * Delete challenges that are consumed or long expired.
 *
 * Called by the housekeeping cron (Phase 11). Retaining them serves nothing: a consumed
 * challenge cannot be reused, and an expired one cannot be verified.
 */
export async function purgeStaleChallenges(olderThan: Date): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `WITH deleted AS (
       DELETE FROM webauthn_challenges
        WHERE (consumed_at IS NOT NULL OR expires_at < $1)
          AND created_at < $1
        RETURNING 1
     )
     SELECT count(*)::text AS count FROM deleted`,
    [olderThan],
  );
  return Number(row?.count ?? 0);
}
