/**
 * OTP challenge persistence.
 *
 * The code itself never appears in this file. Callers generate it with `generateOtpCode`,
 * hash it with `hashOtpCode(code, challengeId)`, and hand over only the hash — which is
 * why `createChallenge` is a two-step insert-then-update inside one transaction: the hash
 * is salted with the challenge id, and the id does not exist until the row does.
 *
 * That ordering is worth stating plainly, because the obvious alternative — generating a
 * UUID in the application so the hash can be computed up front — quietly gives up the
 * database's `gen_random_uuid()` default and puts id generation somewhere it can be got
 * wrong.
 */

import { transaction, query, queryOne } from "@/server/db/pool";
import type { OtpPurposeValue, OtpStatusValue } from "@/server/db/types";

export interface OtpChallenge {
  id: string;
  userId: string | null;
  ownerAccountId: string | null;
  organizationId: string | null;
  purpose: OtpPurposeValue;
  status: OtpStatusValue;
  destination: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  verifiedAt: Date | null;
  createdAt: Date;
}

interface ChallengeRow {
  id: string;
  user_id: string | null;
  owner_account_id: string | null;
  organization_id: string | null;
  purpose: OtpPurposeValue;
  status: OtpStatusValue;
  destination: string;
  attempts: number;
  max_attempts: number;
  expires_at: Date;
  verified_at: Date | null;
  created_at: Date;
}

/** `code_hash` is deliberately absent — no read path returns it outside verification. */
const COLUMNS = `
  id, user_id, owner_account_id, organization_id, purpose, status, destination,
  attempts, max_attempts, expires_at, verified_at, created_at
`;

function toChallenge(row: ChallengeRow): OtpChallenge {
  return {
    id: row.id,
    userId: row.user_id,
    ownerAccountId: row.owner_account_id,
    organizationId: row.organization_id,
    purpose: row.purpose,
    status: row.status,
    destination: row.destination,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    expiresAt: row.expires_at,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
  };
}

/**
 * Which principal a challenge belongs to. Exactly one field is set — the schema's
 * `otp_one_principal` CHECK refuses anything else, and expressing it as a union here
 * means a caller cannot even construct the invalid case.
 */
export type OtpPrincipal =
  | { kind: "TENANT"; userId: string; organizationId: string }
  | { kind: "PLATFORM"; ownerAccountId: string };

export interface NewChallenge {
  principal: OtpPrincipal;
  purpose: OtpPurposeValue;
  destination: string;
  expiresAt: Date;
  maxAttempts?: number;
  ip?: string | null;
  userAgent?: string | null;
  /**
   * Computes the stored hash from the id the database assigned. Called inside the
   * transaction, and the only place the plaintext code is in scope.
   */
  hashCode: (challengeId: string) => Buffer;
}

/**
 * Issue a challenge, superseding any the same principal already had for this purpose.
 *
 * Superseding matters: without it, a person who requests a second code because the first
 * did not arrive would have two live codes, and each carries its own attempt budget — so
 * requesting codes repeatedly would multiply the number of guesses available. One live
 * challenge per principal per purpose keeps the budget meaningful.
 */
export async function createChallenge(challenge: NewChallenge): Promise<OtpChallenge> {
  const { principal, purpose } = challenge;

  return transaction(async (client) => {
    // Supersede first, in the same transaction, so there is no instant at which two live
    // challenges exist for this principal and purpose.
    if (principal.kind === "TENANT") {
      await client.query(
        `UPDATE otp_challenges SET status = 'SUPERSEDED'
          WHERE user_id = $1 AND purpose = $2 AND status = 'PENDING'`,
        [principal.userId, purpose],
      );
    } else {
      await client.query(
        `UPDATE otp_challenges SET status = 'SUPERSEDED'
          WHERE owner_account_id = $1 AND purpose = $2 AND status = 'PENDING'`,
        [principal.ownerAccountId, purpose],
      );
    }

    // A placeholder hash, replaced below. The column is NOT NULL and the real hash needs
    // the id, so the row must exist before it can be computed. The placeholder is 32
    // random-free zero bytes, which no code can hash to.
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO otp_challenges
         (user_id, owner_account_id, organization_id, purpose, code_hash, destination,
          max_attempts, expires_at, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        principal.kind === "TENANT" ? principal.userId : null,
        principal.kind === "PLATFORM" ? principal.ownerAccountId : null,
        principal.kind === "TENANT" ? principal.organizationId : null,
        purpose,
        Buffer.alloc(32),
        challenge.destination,
        challenge.maxAttempts ?? 5,
        challenge.expiresAt,
        challenge.ip ?? null,
        challenge.userAgent ?? null,
      ],
    );

    const id = inserted.rows[0].id;

    const updated = await client.query<ChallengeRow>(
      `UPDATE otp_challenges SET code_hash = $2 WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, challenge.hashCode(id)],
    );

    return toChallenge(updated.rows[0]);
  });
}

/**
 * The live challenge for this principal and purpose, with its stored hash.
 *
 * This is the ONE function that returns `code_hash`, and it exists only so the verifier
 * can compare against it. Expiry is a SQL predicate, so an expired challenge never leaves
 * the database and no caller can forget to check it.
 */
export async function findLiveChallenge(
  principal: OtpPrincipal,
  purpose: OtpPurposeValue,
): Promise<(OtpChallenge & { codeHash: Buffer }) | null> {
  const row =
    principal.kind === "TENANT"
      ? await queryOne<ChallengeRow & { code_hash: Buffer }>(
          `SELECT ${COLUMNS}, code_hash
             FROM otp_challenges
            WHERE user_id = $1
              AND organization_id = $2
              AND purpose = $3
              AND status = 'PENDING'
              AND expires_at > now()
            ORDER BY created_at DESC
            LIMIT 1`,
          [principal.userId, principal.organizationId, purpose],
        )
      : await queryOne<ChallengeRow & { code_hash: Buffer }>(
          `SELECT ${COLUMNS}, code_hash
             FROM otp_challenges
            WHERE owner_account_id = $1
              AND purpose = $2
              AND status = 'PENDING'
              AND expires_at > now()
            ORDER BY created_at DESC
            LIMIT 1`,
          [principal.ownerAccountId, purpose],
        );

  return row ? { ...toChallenge(row), codeHash: row.code_hash } : null;
}

/**
 * Consume a challenge on success.
 *
 * `status = 'PENDING'` is part of the WHERE clause, so this is the single-use guarantee
 * and it is enforced by the database rather than by the caller having checked a moment
 * earlier. Two concurrent verifications of the same code: one updates a row, the other
 * matches nothing and gets null. Returning null therefore means "already consumed", and
 * the caller must treat that as a failure.
 *
 * Both columns move together because `otp_verified_consistency` requires it.
 */
export async function markVerified(challengeId: string): Promise<OtpChallenge | null> {
  const row = await queryOne<ChallengeRow>(
    `UPDATE otp_challenges
        SET status = 'VERIFIED', verified_at = now()
      WHERE id = $1 AND status = 'PENDING' AND expires_at > now()
      RETURNING ${COLUMNS}`,
    [challengeId],
  );
  return row ? toChallenge(row) : null;
}

/**
 * Count a wrong guess, and burn the challenge when the budget is spent.
 *
 * Increment and exhaustion are one statement so they cannot race. Doing it as
 * read-then-write would let concurrent guesses both read `attempts = 4` and both be
 * allowed, handing an attacker extra tries precisely when they are guessing fastest.
 */
export async function recordFailedAttempt(
  challengeId: string,
): Promise<{ attempts: number; exhausted: boolean } | null> {
  const row = await queryOne<{ attempts: number; status: OtpStatusValue }>(
    `UPDATE otp_challenges
        SET attempts = attempts + 1,
            status = CASE
              WHEN attempts + 1 >= max_attempts THEN 'EXHAUSTED'::otp_status
              ELSE status
            END
      WHERE id = $1 AND status = 'PENDING'
      RETURNING attempts, status`,
    [challengeId],
  );

  if (!row) return null;
  return { attempts: row.attempts, exhausted: row.status === "EXHAUSTED" };
}

/**
 * Move timed-out challenges from PENDING to EXPIRED. Housekeeping, run by cron.
 *
 * Purely cosmetic for correctness — every read filters on `expires_at > now()`, so an
 * unswept row is already unusable. It exists so the table tells the truth when a human
 * reads it during a support conversation.
 */
export async function expireStaleChallenges(): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE otp_challenges
        SET status = 'EXPIRED'
      WHERE status = 'PENDING' AND expires_at <= now()
      RETURNING id`,
  );
  return rows.length;
}
