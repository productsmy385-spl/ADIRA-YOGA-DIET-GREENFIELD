import type { Pool } from "pg";

import { pool } from "@/server/db/pool";

/**
 * Database access for integration tests.
 *
 * TWO RULES, both learned the hard way on TaskFlow HR and recorded in its
 * KNOWN-ISSUES.md. Please do not "simplify" either of them away.
 *
 * 1. ONE POOL. This returns the **application** pool, not a second one of its own.
 *    `resetDatabase()` issues TRUNCATE, which needs an ACCESS EXCLUSIVE lock, and a
 *    second pool's idle connections hold table locks that prevent that lock being
 *    granted. The symptom is a suite that passes on its own and times out in a full run
 *    — which looks like flakiness and gets "fixed" by raising the timeout, hiding it.
 *
 *    `tests/setup-db.ts` is what makes this safe: it repoints DATABASE_URL at the
 *    throwaway database before the pool is constructed, so "the application pool" and
 *    "the test pool" are the same object talking to the right database.
 *
 * 2. DO NOT CLOSE IT. `disconnectTestDb()` deliberately closes nothing. Closing a shared
 *    pool between files leaves later files with a dead pool.
 *
 * Suites requiring a database are SKIPPED when SQL_TEST_DATABASE_URL is unset, so the
 * run stays green for a contributor without one while still running fully in CI.
 * Skipping is not passing — a skipped suite is reported as skipped.
 */

/** True when a test database is configured and integration suites should run. */
export const hasTestDatabase = Boolean(process.env.SQL_TEST_DATABASE_URL);

/**
 * The one pool integration tests share — the application's own.
 *
 * Safe only because `tests/setup-db.ts` has already repointed DATABASE_URL, and refuses
 * to do so if it matches the development database.
 */
export function getTestPool(): Pool {
  if (!hasTestDatabase) {
    throw new Error(
      "SQL_TEST_DATABASE_URL is not set. Integration tests need a throwaway database — " +
        "never point this at development or production data, because the helpers here " +
        "TRUNCATE every table.",
    );
  }
  return pool;
}

/**
 * Empty every application table, leaving the schema and migration history intact.
 *
 * `schema_migrations` is excluded: wiping it would make the next run believe the
 * database is unmigrated.
 */
export async function resetDatabase(): Promise<void> {
  const db = getTestPool();

  const { rows } = await db.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`,
  );

  if (rows.length === 0) return;

  const tables = rows.map((row) => `public."${row.tablename}"`).join(", ");
  await db.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}

/**
 * Intentionally a no-op. See rule 2 above — the shared pool outlives every individual
 * test file, and vitest tears the process down when the run ends.
 */
export async function disconnectTestDb(): Promise<void> {
  // Deliberately empty.
}
