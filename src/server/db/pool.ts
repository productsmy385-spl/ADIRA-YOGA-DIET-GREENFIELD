import { Pool, type PoolClient, type QueryResultRow } from "pg";

import { env } from "@/lib/env";

/**
 * The single PostgreSQL connection pool for the application.
 *
 * One pool, process-wide. This is not merely tidiness: TaskFlow HR's Knowledge Base
 * records a whole class of test failure caused by a second pool holding idle
 * connections, which then blocked the ACCESS EXCLUSIVE lock that `TRUNCATE` needs. The
 * suite passed alone and timed out in a full run, which reads like flakiness rather
 * than the lock contention it was. Integration tests must borrow this pool, never build
 * their own — see tests/helpers/sql-db.ts.
 *
 * Next.js recreates modules across hot reloads in development, so the pool is cached on
 * globalThis. Without this, every edit leaks a pool and the connection limit is reached
 * within a few minutes of work.
 */

const globalForPool = globalThis as unknown as { adiraPool?: Pool };

/**
 * Whether to negotiate TLS, decided from the TARGET rather than assumed.
 *
 * Railway's certificates do not chain to a public CA, so without DATABASE_CA_CERT the
 * connection is encrypted but unverified — the same trade-off TempleOS documents.
 * Supplying the cert upgrades it to full verification.
 *
 * What changed: this used to return an `ssl` object unconditionally. Even
 * `{ rejectUnauthorized: false }` still REQUESTS a handshake, and a PostgreSQL with no
 * TLS configured refuses it outright — "The server does not support SSL connections".
 * That is every CI service container and most local installs, so a local database could
 * not be connected to at all. Remote hosts are unaffected: they keep TLS exactly as before.
 */
function sslFor(target: string): { ca: string; rejectUnauthorized: true } | { rejectUnauthorized: false } | false {
  if (env.DATABASE_CA_CERT) {
    return { ca: env.DATABASE_CA_CERT, rejectUnauthorized: true };
  }
  if (/[?&]sslmode=disable/.test(target)) return false;
  if (/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(target)) return false;
  return { rejectUnauthorized: false };
}

function createPool(): Pool {
  return new Pool({
    connectionString: env.DATABASE_URL,
    ssl: sslFor(env.DATABASE_URL),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export const pool: Pool = globalForPool.adiraPool ?? createPool();

if (env.NODE_ENV !== "production") {
  globalForPool.adiraPool = pool;
}

/**
 * Run a parameterised query.
 *
 * Every value must be passed as a parameter. String-interpolating a value into SQL is a
 * SQL-injection defect, not a style preference, and there is no helper here that would
 * make it convenient.
 */
export async function query<T extends QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, params as unknown[]);
  return result.rows;
}

/** Run a query expected to return at most one row. */
export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Run `fn` inside a transaction, rolling back if it throws.
 *
 * The callback receives the client and MUST use it for every statement in the unit of
 * work. Reaching for the module-level `query` inside a transaction silently runs that
 * statement on a different connection, outside the transaction — a bug that survives
 * review easily because the happy path looks correct.
 */
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
      // A failed rollback must not mask the original error, which is the one that
      // explains what actually went wrong.
    });
    throw error;
  } finally {
    client.release();
  }
}
