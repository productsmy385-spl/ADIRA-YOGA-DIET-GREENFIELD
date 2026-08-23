import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

/**
 * Two projects, because the two kinds of test need genuinely different environments.
 * Running everything under jsdom would be slower and less honest — server code that
 * accidentally touched `window` would pass in a test and fail in production.
 *
 * IMPORTANT: options set at the ROOT `test` block are NOT inherited by `projects`.
 * `fileParallelism`, `testTimeout`, and `hookTimeout` were declared at the root when this
 * split was introduced and were silently ignored for months of runs — the symptom was a
 * `Hook timed out in 10000ms` (vitest's default, not the 30s configured) and intermittent
 * worker-start failures under load. Every timing option below is therefore repeated per
 * project deliberately. Do not "de-duplicate" them back up to the root.
 */
export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "server",
          environment: "node",

          // Repoints DATABASE_URL at the throwaway database before anything constructs
          // the pool, so the application and the fixtures share ONE pool. See the file
          // for why a second pool breaks TRUNCATE.
          setupFiles: ["./tests/setup-db.ts"],

          include: [
            "src/lib/**/*.test.ts",
            "src/i18n/**/*.test.ts",
            "src/server/**/*.test.ts",
            // Pure-logic component tests (.ts, never .tsx) — no DOM needed, so they run
            // in the node project rather than paying for a jsdom.
            "src/components/**/*.test.ts",
            "scripts/**/*.test.mjs",
            "tests/**/*.test.ts",
          ],

          /**
           * Serialise test files.
           *
           * Integration suites reset the database with TRUNCATE, which needs an ACCESS
           * EXCLUSIVE lock that a concurrently-running file's idle connections will not
           * grant. TaskFlow HR's Knowledge Base records this precisely: a suite that
           * passes alone and times out in a full run, which reads like flakiness rather
           * than the lock contention it actually is.
           *
           * Note the limit, also recorded there: this serialises files within ONE vitest
           * process. It cannot coordinate across two concurrent `vitest` invocations
           * against the same database.
           */
          fileParallelism: false,

          // The database is a remote Railway instance, so every fixture insert costs a
          // network round trip. A beforeEach that truncates and seeds seven rows is
          // comfortably past vitest's 10s default.
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["src/components/**/*.test.tsx", "src/app/**/*.test.tsx"],
          setupFiles: ["./tests/setup-ui.ts"],

          // Threads rather than the default forks pool: spawning a process per file and
          // building a jsdom in each times out the worker handshake on Windows.
          pool: "threads",

          testTimeout: 15_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
