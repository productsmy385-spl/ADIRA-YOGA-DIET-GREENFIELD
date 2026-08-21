import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",

    // Tests live beside the code they test. Integration suites that need a real database
    // live under tests/.
    include: [
      "src/**/*.test.{ts,tsx}",
      "scripts/**/*.test.mjs",
      "tests/**/*.test.ts",
    ],

    /**
     * Serialise test files.
     *
     * Integration suites reset the database with TRUNCATE, which needs an ACCESS
     * EXCLUSIVE lock that a concurrently-running file's idle connections will not grant.
     * TaskFlow HR's Knowledge Base records this precisely: a suite that passes alone and
     * times out in a full run, which reads like flakiness rather than the lock
     * contention it actually is.
     *
     * Note the limit of this setting, also recorded there: it serialises files within
     * ONE vitest process. It cannot coordinate across two concurrent `vitest`
     * invocations against the same database — for that, point SQL_TEST_DATABASE_URL at
     * a throwaway database instead.
     */
    fileParallelism: false,

    // Fail fast on a hung database connection rather than sitting at the default.
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
