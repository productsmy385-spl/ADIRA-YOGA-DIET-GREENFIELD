/**
 * The pre-deploy gate: is the target database at the revision this code requires?
 *
 * A wrapper rather than an inline `ADIRA_VERIFY_DEPLOYMENT=1 vitest ...` in package.json,
 * because `npm run` uses cmd.exe on Windows and that syntax is a Unix shellism — it fails
 * with "'ADIRA_VERIFY_DEPLOYMENT' is not recognized". Setting the variable in Node keeps
 * one command that works on every machine this project is developed on, and avoids adding
 * `cross-env` for a single line.
 *
 * READ-ONLY. It reports the gap; `npm run migrate` closes it.
 */
import { spawn } from "node:child_process";

const child = spawn(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "--project",
    "server",
    "tests/migration-readiness.test.ts",
  ],
  {
    stdio: "inherit",
    env: { ...process.env, ADIRA_VERIFY_DEPLOYMENT: "1" },
  },
);

child.on("exit", (code) => process.exit(code ?? 1));
