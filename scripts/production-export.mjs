/**
 * A complete, read-only logical export of every row — the pre-migration safety net.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS RATHER THAN `pg_dump`
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `pg_dump` is the right tool and it is not installed on this machine, nor is Railway's
 * volume-backup setting readable from the CLI. That leaves "we probably have a backup" as
 * the state of knowledge going into a migration that rewrites the role of every user,
 * which is not good enough — a recovery plan you have not exercised is a hope.
 *
 * So this reads every row of every table over the existing connection and writes them to
 * one JSON file. The database is small enough that this is trivially complete: a few
 * hundred rows in total. It is NOT a general-purpose backup tool and should not become
 * one — past a few thousand rows, install `pg_dump`.
 *
 * READ-ONLY, ENFORCED BY POSTGRESQL. Everything runs inside `BEGIN READ ONLY`, in a
 * SERIALIZABLE snapshot so every table is read as of the same instant. A backup stitched
 * from several moments is one that can restore to a state that never existed.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE OUTPUT CONTAINS REAL PERSONAL DATA
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Email addresses, names, and session token hashes. It is written to `.baseline/`, which
 * is gitignored, and it must not be committed, pasted into a ticket, or attached to a
 * message. Delete it once the migration is confirmed.
 *
 * Usage:
 *   node scripts/production-export.mjs                 → .baseline/export-<timestamp>.json
 *   node scripts/production-export.mjs --out path.json
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Client } from "pg";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
    break;
  } catch {
    // Absent or unparseable; the variables may already be in the environment.
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outPath =
  outIndex >= 0
    ? args[outIndex + 1]
    : `.baseline/export-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

/**
 * Rows this export must never leave lying around in plaintext.
 *
 * Session and OTP secrets are already stored only as hashes, so exporting them is not a
 * credential leak — but an exported hash is still an offline target, and the rows are
 * worthless for recovery anyway: every session should be re-established after a role
 * migration, and every OTP challenge expires in minutes. Redacting them makes the file
 * meaningfully less dangerous at no cost to its purpose.
 */
const REDACTED_COLUMNS = new Set([
  "token_hash",
  "code_hash",
  "challenge",
  "public_key",
  "secret",
]);

function redact(rows) {
  return rows.map((row) => {
    const copy = { ...row };
    for (const key of Object.keys(copy)) {
      if (REDACTED_COLUMNS.has(key) && copy[key] !== null) copy[key] = "[redacted]";
    }
    return copy;
  });
}

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: process.env.DATABASE_CA_CERT
    ? { ca: process.env.DATABASE_CA_CERT, rejectUnauthorized: true }
    : { rejectUnauthorized: false },
});

await client.connect();

let payload;
try {
  // SERIALIZABLE READ ONLY: one consistent snapshot across every table, and the server
  // refuses any write from this transaction.
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY");

  const [{ db }] = (await client.query("SELECT current_database() AS db")).rows;

  const tables = (
    await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    )
  ).rows.map((row) => row.tablename);

  const data = {};
  let total = 0;

  for (const table of tables) {
    // Identifier comes from pg_tables, never from user input, and is quoted regardless.
    const { rows } = await client.query(`SELECT * FROM public."${table}"`);
    data[table] = redact(rows);
    total += rows.length;
  }

  payload = {
    exportedAt: new Date().toISOString(),
    database: db,
    note:
      "Read-only logical export taken before a migration. Contains personal data — " +
      "do not commit or share. Secrets are redacted; those rows are not restorable and " +
      "are not meant to be.",
    tableCount: tables.length,
    rowCount: total,
    data,
  };
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.end();
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");

console.log(
  `Exported ${payload.rowCount} rows across ${payload.tableCount} tables ` +
    `from "${payload.database}" → ${outPath}`,
);
console.log("This file contains personal data. Do not commit it.");
