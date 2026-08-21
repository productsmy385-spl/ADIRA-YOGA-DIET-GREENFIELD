#!/usr/bin/env node
/**
 * Forward-only migration runner.
 *
 * Schema evolves through numbered SQL files applied in filename order, each inside its
 * own transaction, tracked by full filename. There is no rollback machinery: a mistake
 * is corrected by a new forward migration, never by editing an applied one.
 *
 * Three properties this runner adds over the naive version, each fixing a hazard
 * recorded in the Knowledge Base:
 *
 *   1. ADVISORY LOCK. The whole run holds a session-level advisory lock, so two
 *      concurrent deploy replicas cannot both decide the same migration is pending.
 *
 *   2. CHECKSUM VERIFICATION. An applied migration whose contents have since changed is
 *      a hard error. "Never edit an applied migration" becomes a rule the runner
 *      enforces rather than a convention the reviewer has to remember.
 *
 *   3. RUNS ON DEPLOY. Wired as Railway's release step in railway.json, so a deploy
 *      cannot succeed against an unmigrated database. TempleOS runs migrations manually
 *      and its KNOWN-ISSUES.md records the production incident that caused.
 *
 * Deciding what to apply lives in migration-plan.mjs, which is pure and tested. This
 * file is only the side effects.
 *
 * Usage:
 *   node scripts/migrate.mjs             apply all pending migrations
 *   node scripts/migrate.mjs --dry-run   list what would be applied, change nothing
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { pendingMigrations, readMigrations, verifyChecksums } from "./migration-plan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "migrations");

/**
 * Arbitrary but fixed. Every process that migrates this database must use the same
 * number, or the lock protects nothing.
 */
const ADVISORY_LOCK_ID = 8_314_207;

const dryRun = process.argv.includes("--dry-run");

/** Load .env.local for local runs. In Railway the variables are already in the process. */
function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    try {
      process.loadEnvFile(path);
      return;
    } catch {
      // An unparseable env file should not stop a run where the variables are already
      // present in the environment.
    }
  }
}

async function ensureTrackingTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    text        PRIMARY KEY,
      checksum    text        NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function main() {
  loadLocalEnv();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Set it in .env.local for a local run, or in the Railway " +
        "environment for a deploy. See .env.example.",
    );
  }

  const migrations = readMigrations(MIGRATIONS_DIR);
  if (migrations.length === 0) {
    console.log("No migration files found in migrations/.");
    return;
  }

  const client = new pg.Client({
    connectionString,
    ssl: process.env.DATABASE_CA_CERT
      ? { ca: process.env.DATABASE_CA_CERT, rejectUnauthorized: true }
      : { rejectUnauthorized: false },
  });

  try {
    await client.connect();
  } catch (error) {
    // A dry run is a question about ordering, and that question is still answerable
    // without a database — usefully so before the database exists. It must never be
    // mistaken for a real plan, hence the explicit "applied state unknown" wording.
    if (dryRun) {
      const detail = error.message || error.code || "unknown connection error";
      console.log(`Could not reach the database: ${detail}`);
      console.log(`Applied state is UNKNOWN. Showing all migrations in apply order:\n`);
      for (const migration of migrations) {
        console.log(`  - ${migration.filename}  (${migration.checksum})`);
      }
      console.log(`\n${migrations.length} migration file(s). Nothing was applied.`);
      return;
    }
    throw error;
  }

  try {
    await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_ID]);
    await ensureTrackingTable(client);

    const { rows } = await client.query("SELECT filename, checksum FROM schema_migrations");
    const applied = new Map(rows.map((row) => [row.filename, row.checksum]));

    verifyChecksums(migrations, applied);

    const pending = pendingMigrations(migrations, applied);

    if (pending.length === 0) {
      console.log(`Up to date — ${applied.size} migration(s) already applied.`);
      return;
    }

    if (dryRun) {
      console.log(`${pending.length} migration(s) pending, in order:`);
      for (const migration of pending) {
        console.log(`  - ${migration.filename}  (${migration.checksum})`);
      }
      console.log("\nDry run: nothing was applied.");
      return;
    }

    for (const migration of pending) {
      process.stdout.write(`Applying ${migration.filename} … `);
      try {
        // One transaction per file. Note the consequence, documented in docs/DATABASE.md:
        // `ALTER TYPE ... ADD VALUE` cannot be *used* in the same migration that adds it,
        // because PostgreSQL forbids using a new enum value before its transaction
        // commits. Add the value in one migration, use it in a later one.
        await client.query("BEGIN");
        await client.query(migration.contents);
        await client.query(
          "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
          [migration.filename, migration.checksum],
        );
        await client.query("COMMIT");
        console.log("ok");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        console.log("FAILED");
        throw new Error(`Migration ${migration.filename} failed: ${error.message}`, {
          cause: error,
        });
      }
    }

    console.log(`\nApplied ${pending.length} migration(s).`);
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_ID]).catch(() => {});
    await client.end();
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
