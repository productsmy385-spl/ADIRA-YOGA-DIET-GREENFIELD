/**
 * Attempt counting for the rate limiter.
 *
 * The *policy* — how many attempts are allowed and over what window — is pure and lives
 * in `src/server/auth/rate-limit.ts`. This file only counts rows. Keeping the two apart
 * is what lets the interesting half be tested exhaustively without a database.
 *
 * Rows are counted within a window rather than decremented from a bucket. A bucket needs
 * read-modify-write, and two concurrent attempts can both read "1 remaining" and both
 * proceed. Counting cannot race: the row is either inside the window or it is not.
 */

import { query, queryOne } from "@/server/db/pool";
import type { AttemptCounts, AuthAction } from "@/server/auth/rate-limit";

export type AttemptScope = "ACCOUNT" | "IP";

/**
 * Record one attempt, successful or not.
 *
 * Both dimensions are written for every attempt — one ACCOUNT row and one IP row — so
 * that neither limit is a way around the other. Writing only the failing dimension would
 * leave the other blind.
 *
 * `subject` for an ACCOUNT row is the account id where one is known, and the *submitted
 * address* where it is not. That matters: an attempt against an address with no account
 * must still be counted, or the limiter cannot see the enumeration it exists to stop.
 * `auth_attempts.subject` is deliberately text and not a foreign key for exactly this.
 */
export async function recordAttempt(params: {
  action: AuthAction;
  accountSubject: string;
  ip?: string | null;
  successful: boolean;
}): Promise<void> {
  const { action, accountSubject, ip, successful } = params;

  // One statement rather than two round trips. The IP row is omitted when the address is
  // unknown — writing a literal 'unknown' subject would merge every such request into one
  // shared budget and lock them out collectively.
  if (ip) {
    await query(
      `INSERT INTO auth_attempts (scope, subject, action, successful)
       VALUES ('ACCOUNT', $1, $2, $3), ('IP', $4, $2, $3)`,
      [accountSubject, action, successful, ip],
    );
    return;
  }

  await query(
    `INSERT INTO auth_attempts (scope, subject, action, successful)
     VALUES ('ACCOUNT', $1, $2, $3)`,
    [accountSubject, action, successful],
  );
}

/**
 * Count attempts for both dimensions since `since`, in one query.
 *
 * THROWS on failure, and that is deliberate. `rate-limit.ts` documents that the limiter
 * fails closed: a caller that cannot read the counts must deny, not allow. Returning
 * zeros here would silently disable the limiter under exactly the database load an
 * attacker can cause — so the error must reach the caller and be handled as a denial.
 *
 * Only FAILED attempts count toward the budget. A person legitimately signing in ten
 * times from a shared office address should not exhaust it, whereas ten failures from
 * that address is the signal worth acting on.
 */
export async function countRecentAttempts(params: {
  action: AuthAction;
  accountSubject: string;
  ip?: string | null;
  since: Date;
}): Promise<AttemptCounts> {
  const { action, accountSubject, ip, since } = params;

  const row = await queryOne<{ account: string; ip: string }>(
    `SELECT
       count(*) FILTER (WHERE scope = 'ACCOUNT' AND subject = $1)::text AS account,
       count(*) FILTER (WHERE scope = 'IP'      AND subject = $2)::text AS ip
     FROM auth_attempts
     WHERE action = $3
       AND created_at >= $4
       AND successful = false`,
    [accountSubject, ip ?? "", action, since],
  );

  return { account: Number(row?.account ?? 0), ip: Number(row?.ip ?? 0) };
}

/**
 * Clear the attempt history for an account after a successful authentication.
 *
 * Without this, someone who mistyped a code four times and then succeeded would carry
 * four failures for the rest of the window and be limited on their next legitimate
 * attempt. Scoped to ACCOUNT only: the IP history belongs to everyone behind that
 * address, and one person's success is not evidence about the rest of them.
 */
export async function clearAccountAttempts(
  accountSubject: string,
  action: AuthAction,
): Promise<void> {
  await query(
    `DELETE FROM auth_attempts
      WHERE scope = 'ACCOUNT' AND subject = $1 AND action = $2`,
    [accountSubject, action],
  );
}

/**
 * Delete attempt rows older than the longest window. Housekeeping, run by cron.
 *
 * This table takes a row per attempt and is never read outside its window, so without a
 * sweep it grows without bound and its index with it.
 */
export async function deleteAttemptsBefore(cutoff: Date): Promise<number> {
  const rows = await query<{ id: string }>(
    `DELETE FROM auth_attempts WHERE created_at < $1 RETURNING id`,
    [cutoff],
  );
  return rows.length;
}
