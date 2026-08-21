import { Pool } from "pg";

/**
 * Database access for integration tests.
 *
 * TWO RULES, both learned the hard way on TaskFlow HR and recorded in its
 * KNOWN-ISSUES.md. Please do not "simplify" either of them away.
 *
 * 1. ONE POOL. `resetDatabase()` issues TRUNCATE, which needs an ACCESS EXCLUSIVE lock.
 *    A second pool's idle connections hold table locks that prevent that lock being
 *    granted. The symptom is a suite that passes on its own and times out in a full run
 *    — which looks like flakiness and gets "fixed" by raising the timeout, hiding it.
 *
 * 2. DO NOT CLOSE IT. `disconnectTestDb()` deliberately closes nothing. Closing a shared
 *    pool between files leaves later files with a dead pool.
 *
 * Tests requiring a database are SKIPPED when SQL_TEST_DATABASE_URL is unset, so the
 * suite stays green for a contributor without one while still running fully in CI.
 * Skipping is not the same as passing: `describeWithDatabase` reports the skip.
 */

const connectionString = process.env.SQL_TEST_DATABASE_URL;

/** True when a test database is configured and integration suites should run. */
export const hasTestDatabase = Boolean(connectionString);

let sharedPool: Pool | null = null;

/**
 * The one pool integration tests share.
 *
 * Throws if no test database is configured — call sites should be guarded by
 * `hasTestDatabase` (or use `describeWithDatabase`) so this never fires in practice.
 */
export function getTestPool(): Pool {
  if (!connectionString) {
    throw new Error(
      "SQL_TEST_DATABASE_URL is not set. Integration tests need a throwaway database — " +
        "never point this at development or production data, because the helpers here " +
        "TRUNCATE every table.",
    );
  }

  sharedPool ??= new Pool({
    connectionString,
    ssl: process.env.DATABASE_CA_CERT
      ? { ca: process.env.DATABASE_CA_CERT, rejectUnauthorized: true }
      : { rejectUnauthorized: false },
    max: 5,
  });

  return sharedPool;
}

/**
 * Empty every application table, leaving the schema and the migration history intact.
 *
 * `schema_migrations` is excluded: wiping it would make the next run believe the
 * database is unmigrated.
 */
export async function resetDatabase(): Promise<void> {
  const pool = getTestPool();

  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`,
  );

  if (rows.length === 0) return;

  const tables = rows.map((row) => `public."${row.tablename}"`).join(", ");
  await pool.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}

/**
 * Intentionally a no-op. See rule 2 above — the shared pool outlives every individual
 * test file, and vitest tears the process down when the run ends.
 */
export async function disconnectTestDb(): Promise<void> {
  // Deliberately empty.
}
