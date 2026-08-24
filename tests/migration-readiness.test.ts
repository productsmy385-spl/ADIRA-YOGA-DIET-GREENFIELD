import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { PG_ENUMS } from "@/server/db/types";

import { currentDatabaseName, describeDeploymentGate, readOnly } from "./helpers/sql-db";

/**
 * IS THE DEPLOYED DATABASE AT THE REVISION THIS CODE REQUIRES?
 *
 * Separate from `schema-contract.test.ts` on purpose. That suite asks whether the schema
 * is STRUCTURALLY sound — composite foreign keys present, tenant columns NOT NULL — and a
 * failure there means somebody shipped a migration that broke an invariant. This suite
 * asks something different: whether every migration in the repository has actually been
 * applied to the database this code is about to talk to.
 *
 * The two fail for different reasons and are fixed by different people, so conflating
 * them produces a red suite whose message does not say what to do.
 *
 * A FAILURE HERE IS NOT A CODE DEFECT. It means the database is behind the code, and the
 * application will fail at runtime the first time it uses something the pending migration
 * adds — casting to an enum label that does not exist yet, most often, which surfaces as
 * a 500 rather than as anything that names the real cause.
 *
 * Runs under `npm run verify:deploy`, not in `npm test`. Being behind is a fact about the
 * ENVIRONMENT, and a suite that is permanently red for something no code change can fix
 * is a suite people stop reading.
 *
 * Read-only throughout: it reports the gap, it never closes it. Applying a migration is a
 * deploy step (`npm run migrate`, run as Railway's pre-deploy command), and a test suite
 * that quietly migrated the database it was verifying would be the worst possible way to
 * discover a bad migration.
 */

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);

/** Every migration in the repository, in the order the runner applies them. */
function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

describeDeploymentGate("migration readiness", () => {
  it("has applied every migration in the repository", async () => {
    const expected = migrationFiles();
    const [database, applied] = await Promise.all([
      currentDatabaseName(),
      readOnly(async (client) => {
        const { rows } = await client.query<{ filename: string }>(
          "SELECT filename FROM schema_migrations ORDER BY filename",
        );
        return rows.map((row) => row.filename);
      }),
    ]);

    const pending = expected.filter((name) => !applied.includes(name));

    expect(
      pending,
      `Database "${database}" is behind this code. Pending migrations: ` +
        `${pending.join(", ") || "none"}. This is a DEPLOYMENT gap, not a code defect — ` +
        "apply them with `npm run migrate` (or let the Railway pre-deploy command do it) " +
        "and re-run. Do not edit an applied migration; the runner verifies checksums.",
    ).toEqual([]);
  });

  it("has no applied migration that is missing from the repository", async () => {
    // The other direction, and the more alarming one: a filename in `schema_migrations`
    // with no file behind it means the database was migrated from a tree that no longer
    // exists — a reverted branch, or someone else's. The checksum guard cannot catch this
    // because there is nothing left to compare against.
    const expected = new Set(migrationFiles());
    const applied = await readOnly(async (client) => {
      const { rows } = await client.query<{ filename: string }>(
        "SELECT filename FROM schema_migrations ORDER BY filename",
      );
      return rows.map((row) => row.filename);
    });

    expect(applied.filter((name) => !expected.has(name))).toEqual([]);
  });

  it("declares every enum label the TypeScript mirrors depend on", async () => {
    /*
     * The runtime consequence of being behind, made explicit.
     *
     * `PG_ENUMS` describes the schema this code expects. A label the code casts to but the
     * database has not got yet is not a typecheck failure — a hand-written union that is
     * merely ahead of the database still compiles — it is a 500 on whichever request first
     * writes that value. TaskFlow HR shipped exactly this with `LOCKED`.
     */
    const live = await readOnly(async (client) => {
      const { rows } = await client.query<{ typname: string; labels: string[] }>(
        `SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] AS labels
           FROM pg_type t
           JOIN pg_enum e ON e.enumtypid = t.oid
           JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'public'
          GROUP BY t.typname`,
      );
      return new Map(rows.map((row) => [row.typname, row.labels]));
    });

    const gaps: string[] = [];

    for (const [name, expectedLabels] of Object.entries(PG_ENUMS)) {
      const actual = live.get(name);
      if (!actual) {
        gaps.push(`${name}: type does not exist`);
        continue;
      }
      const missing = [...expectedLabels].filter((label) => !actual.includes(label));
      if (missing.length > 0) gaps.push(`${name}: missing ${missing.join(", ")}`);
    }

    expect(
      gaps,
      "The code casts to enum labels this database does not have. Apply the pending " +
        "migrations before deploying — every write of a missing label will fail at runtime.",
    ).toEqual([]);
  });

  it("does not carry enum labels the code has forgotten about", async () => {
    /*
     * Extra labels are NOT a failure, because PostgreSQL cannot drop an enum value —
     * ADR-013's merge leaves `ORG_OWNER` and `CUSTOMER` behind permanently. This asserts
     * only that anything extra is one of the labels we know is stranded, so a genuinely
     * unexpected one still gets noticed.
     */
    const STRANDED_BY_DESIGN: Record<string, readonly string[]> = {
      tenant_role: ["ORG_OWNER", "CUSTOMER"],
    };

    const live = await readOnly(async (client) => {
      const { rows } = await client.query<{ typname: string; labels: string[] }>(
        `SELECT t.typname, array_agg(e.enumlabel)::text[] AS labels
           FROM pg_type t
           JOIN pg_enum e ON e.enumtypid = t.oid
           JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'public'
          GROUP BY t.typname`,
      );
      return new Map(rows.map((row) => [row.typname, row.labels]));
    });

    const unexpected: string[] = [];

    for (const [name, expectedLabels] of Object.entries(PG_ENUMS)) {
      const allowed = new Set([...expectedLabels, ...(STRANDED_BY_DESIGN[name] ?? [])]);
      for (const label of live.get(name) ?? []) {
        if (!allowed.has(label)) unexpected.push(`${name}.${label}`);
      }
    }

    expect(unexpected).toEqual([]);
  });
});
