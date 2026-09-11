/**
 * Whether to negotiate TLS for a PostgreSQL connection, decided from the TARGET.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A MODULE RATHER THAN SIX COPIES
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * It WAS six copies. The same three-line ternary sat in `migrate.mjs`,
 * `verify-schema.mjs`, `seed-owner.mjs`, `seed-organization.mjs`,
 * `production-export.mjs` and `production-baseline.mjs`, plus a seventh in
 * `src/server/db/pool.ts`. All six were wrong in the same way, and fixing the first two
 * only moved CI's failure from the Migrate step to the Verify step — the same error, one
 * script later. A rule duplicated per caller gets fixed per caller.
 *
 * ── The bug the copies shared ──────────────────────────────────────────────────
 * They passed an `ssl` option unconditionally, falling back to
 * `{ rejectUnauthorized: false }`. That is NOT "SSL off": it still requests a TLS
 * handshake, and a PostgreSQL with no TLS configured refuses it outright with
 *
 *     The server does not support SSL connections
 *
 * which is every CI service container and most local installs. `rejectUnauthorized:
 * false` only relaxes certificate VERIFICATION; it does not make TLS optional.
 *
 * ── What each answer means ─────────────────────────────────────────────────────
 *   DATABASE_CA_CERT set          verified TLS — the cert is pinned and checked
 *   localhost / 127.0.0.1 / [::1] no TLS — CI containers and local development
 *   ?sslmode=disable              no TLS — an explicit operator opt-out
 *   anything else                 unverified TLS — remote, so encrypted either way
 *
 * The last case is the Railway one: its certificates do not chain to a public CA, so the
 * connection is encrypted but unverified unless DATABASE_CA_CERT is supplied. That
 * trade-off is deliberate and unchanged — this module did not loosen production, it
 * stopped demanding TLS from servers that have none.
 *
 * `src/server/db/pool.ts` implements the identical rule in TypeScript rather than
 * importing this: `scripts/` is plain ESM run by node directly, and pulling a script into
 * the application bundle to share four lines would be the worse coupling. The two are
 * kept in step by the comment in each pointing at the other.
 */

/**
 * @param {string} connectionString The PostgreSQL URL being connected to.
 * @returns {{ca: string, rejectUnauthorized: true} | {rejectUnauthorized: false} | false}
 *   A `pg` ssl option. `false` disables TLS entirely.
 */
export function sslFor(connectionString) {
  if (process.env.DATABASE_CA_CERT) {
    return { ca: process.env.DATABASE_CA_CERT, rejectUnauthorized: true };
  }

  const target = connectionString ?? "";
  if (/[?&]sslmode=disable/.test(target)) return false;
  if (/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(target)) return false;

  return { rejectUnauthorized: false };
}
