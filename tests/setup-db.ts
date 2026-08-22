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
 * If SQL_TEST_DATABASE_URL is unset, this does nothing and the database suites skip.
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

const testUrl = process.env.SQL_TEST_DATABASE_URL;

if (testUrl) {
  if (testUrl === process.env.DATABASE_URL) {
    throw new Error(
      "SQL_TEST_DATABASE_URL is identical to DATABASE_URL. The test helpers TRUNCATE " +
        "every table — running against the development database would destroy its data.",
    );
  }

  process.env.DATABASE_URL = testUrl;
}
