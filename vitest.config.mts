import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

/**
 * Two projects, because the two kinds of test need genuinely different environments and
 * running everything under jsdom would be both slower and less honest — server code that
 * accidentally touches `window` would pass in a test and fail in production.
 */
export default defineConfig({
  resolve: { alias },
  test: {
    /**
     * Serialise test files.
     *
     * Integration suites reset the database with TRUNCATE, which needs an ACCESS
     * EXCLUSIVE lock that a concurrently-running file's idle connections will not grant.
     * TaskFlow HR's Knowledge Base records this precisely: a suite that passes alone and
     * times out in a full run, which reads like flakiness rather than the lock
     * contention it actually is.
     *
     * Note the limit, also recorded there: it serialises files within ONE vitest
     * process. It cannot coordinate across two concurrent `vitest` invocations against
     * the same database — for that, point SQL_TEST_DATABASE_URL at a throwaway database.
     */
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,

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
            "scripts/**/*.test.mjs",
            "tests/**/*.test.ts",
          ],
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
          // building a jsdom in each times out the worker handshake on Windows. The
          // server project keeps forks, where process isolation is worth having.
          pool: "threads",
        },
      },
    ],
  },
});
