/**
 * Point the APPLICATION at the test database, before anything imports it.
 *
 * This runs as a vitest setup file, so it executes before the test file's imports pull
 * in `src/lib/env.ts` → `src/server/db/pool.ts`. By the time the application pool is
 * constructed, `DATABASE_URL` already names the throwaway database.
 *
 * WHY NOT JUST GIVE THE TESTS THEIR OWN POOL
 *
 * Because that is the mistake TaskFlow HR's Knowledge Base records. `resetDatabase()`
 * issues TRUNCATE, which needs an ACCESS EXCLUSIVE lock, and a *second* pool's idle
 * connections hold table locks that stop that lock being granted. The symptom is a suite
 * that passes alone and times out in a full run — which reads like flakiness and gets
 * "fixed" by raising the timeout, hiding it.
 *
 * So there is exactly one pool per run, and both the repositories under test and the
 * fixtures share it. That is only possible if the application itself is pointed at the
 * test database, which is what this file does.
 *
 * Without ADIRA_ISOLATED_TEST_DB=1 this does nothing: DATABASE_URL keeps naming the real
 * database, read-only verification runs against it, and the destructive suites skip.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load `.env.local` for local runs.
 *
 * Vitest does not read it — that is Next's behaviour, not Node's — so without this the
 * suite fails at `env.ts` with five missing keys, which looks like a configuration bug
 * rather than a missing loader. In CI the variables are already in the environment and
 * this is a no-op.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const file of [".env.local", ".env"]) {
  const path = join(root, file);
  if (!existsSync(path)) continue;
  try {
    process.loadEnvFile(path);
    break;
  } catch {
    // An unparseable file must not stop a run whose variables are already set.
  }
}

/**
 * Repoint the application at the ISOLATED database — and only ever at that.
 *
 * Gated on `ADIRA_ISOLATED_TEST_DB=1` as well as the URL, so the destructive path needs a
 * deliberate act and not merely a variable someone left in `.env.local`. Without the
 * opt-in this file does nothing at all: `DATABASE_URL` keeps naming the real database,
 * the read-only suites verify the real schema against it, and the destructive suites
 * skip themselves with a reason. See `tests/helpers/sql-db.ts`.
 */
const testUrl = process.env.SQL_TEST_DATABASE_URL;
const optedIn = process.env.ADIRA_ISOLATED_TEST_DB === "1";

/*
 * Preserve what DATABASE_URL meant BEFORE this file changes it.
 *
 * This alias is deliberate — one pool, shared by the repositories under test and the
 * fixtures, because a second pool's idle connections block the ACCESS EXCLUSIVE lock
 * TRUNCATE needs. But it destroys the evidence the isolation guard depends on: once
 * DATABASE_URL has been overwritten with the test URL, "are these two the same database?"
 * can only ever answer yes.
 *
 * That is not hypothetical. The guard did exactly that and refused every isolated run,
 * reading its own harness's aliasing as proof of danger, so 110 destructive tests skipped
 * permanently while appearing merely "not configured".
 *
 * The original is therefore recorded under its own name, and `sql-db.ts` compares against
 * THIS rather than against the live DATABASE_URL. The comparison it needs is
 * "test database ≠ the application's real database", and this is the only place that
 * still knows what the real one was.
 */
if (process.env.DATABASE_URL && !process.env.ADIRA_PRODUCTION_DATABASE_URL) {
  process.env.ADIRA_PRODUCTION_DATABASE_URL = process.env.DATABASE_URL;
}

if (optedIn && testUrl) {
  /*
   * No throw for the two being equal.
   *
   * That means the application is pointed at the test database itself, which is the
   * configuration `docs/RAILWAY.md` asks for — local development must not point at
   * production. Refusing it here blocked every destructive suite the moment a developer
   * set their machine up the safe way.
   *
   * The real protection lives in `isolationRefusal`, which still rejects a protected
   * database name whatever the URLs say, and still rejects the same database reached
   * through two different hosts — the Railway internal/proxy case a string comparison
   * misses. Duplicating a weaker version of that rule here only produced a false positive.
   */
  process.env.DATABASE_URL = testUrl;
}
