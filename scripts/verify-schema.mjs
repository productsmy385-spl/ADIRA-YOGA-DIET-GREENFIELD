#!/usr/bin/env node
/**
 * Assert that the applied schema actually carries the invariants the ADRs claim.
 *
 * "The migration ran without error" is a weaker statement than it sounds. A migration
 * can apply cleanly and still leave the tenancy boundary unenforced — a foreign key
 * written against `users(id)` instead of `users(id, organization_id)` is a one-word
 * difference that applies fine and silently permits cross-tenant links.
 *
 * So this checks the properties, not the absence of errors. It is the acceptance
 * evidence for Phase 1, and it is safe to re-run at any time.
 *
 * Usage:  node scripts/verify-schema.mjs
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { PG_ENUM_EXPECTATIONS } from "./schema-expectations.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const EXPECTED_TABLES = [
  "audit_logs",
  "auth_attempts",
  "consultant_assignments",
  "jobs",
  "organizations",
  "otp_challenges",
  "owner_accounts",
  "owner_sessions",
  "passkey_credentials",
  "schema_migrations",
  "sessions",
  "users",
];

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    try {
      process.loadEnvFile(path);
      return;
    } catch {
      /* already-present env is enough */
    }
  }
}

const results = [];
const record = (ok, label, detail = "") => results.push({ ok, label, detail });

async function checkTables(client) {
  const { rows } = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  const present = new Set(rows.map((r) => r.tablename));

  for (const table of EXPECTED_TABLES) {
    record(present.has(table), `table ${table}`);
  }

  const unexpected = [...present].filter((t) => !EXPECTED_TABLES.includes(t));
  if (unexpected.length > 0) {
    record(true, `note: extra tables present`, unexpected.join(", "));
  }
}

async function checkEnums(client) {
  const { rows } = await client.query(
    `SELECT t.typname, e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'`,
  );

  const actual = new Map();
  for (const row of rows) {
    if (!actual.has(row.typname)) actual.set(row.typname, new Set());
    actual.get(row.typname).add(row.enumlabel);
  }

  for (const [name, expected] of Object.entries(PG_ENUM_EXPECTATIONS)) {
    const labels = actual.get(name);
    if (!labels) {
      record(false, `enum ${name}`, "type does not exist");
      continue;
    }
    const missing = expected.filter((v) => !labels.has(v));
    const extra = [...labels].filter((v) => !expected.includes(v));
    record(
      missing.length === 0 && extra.length === 0,
      `enum ${name}`,
      [
        missing.length ? `missing ${missing.join(",")}` : "",
        extra.length ? `unexpected ${extra.join(",")}` : "",
      ]
        .filter(Boolean)
        .join("; "),
    );
  }
}

/**
 * The platform boundary is an ABSENT column. ADR-001 relies on there being nowhere to
 * put an organization on a platform account — if someone later "helpfully" adds one,
 * every argument in that ADR quietly stops holding.
 */
async function checkPlatformBoundary(client) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'owner_accounts'
        AND column_name = 'organization_id'`,
  );
  record(
    rows.length === 0,
    "owner_accounts has NO organization_id column",
    rows.length > 0 ? "column exists — ADR-001 boundary is broken" : "",
  );

  const { rows: userOrg } = await client.query(
    `SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
        AND column_name = 'organization_id'`,
  );
  record(
    userOrg[0]?.is_nullable === "NO",
    "users.organization_id is NOT NULL",
    userOrg.length === 0 ? "column missing" : "",
  );
}

/**
 * The composite foreign keys are what make cross-tenant links unrepresentable (ADR-004).
 * A plain `REFERENCES users(id)` would apply cleanly and enforce nothing about tenancy.
 */
async function checkCompositeForeignKeys(client) {
  const { rows } = await client.query(`
    SELECT
      con.conname,
      child.relname  AS child_table,
      parent.relname AS parent_table,
      ARRAY(
        SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
        ORDER BY k.ord
      ) AS child_columns
    FROM pg_constraint con
    JOIN pg_class child  ON child.oid  = con.conrelid
    JOIN pg_class parent ON parent.oid = con.confrelid
    WHERE con.contype = 'f' AND parent.relname = 'users'
  `);

  const expected = [
    ["consultant_assignments", "consultant_id"],
    ["consultant_assignments", "customer_id"],
    ["sessions", "user_id"],
  ];

  for (const [table, column] of expected) {
    const match = rows.find(
      (r) =>
        r.child_table === table &&
        r.child_columns.includes(column) &&
        r.child_columns.includes("organization_id"),
    );
    record(
      Boolean(match),
      `${table}.${column} → users is COMPOSITE (includes organization_id)`,
      match ? "" : "not composite — cross-tenant rows would be permitted",
    );
  }
}

async function checkUniqueIndexes(client) {
  const { rows } = await client.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`,
  );
  const byName = new Map(rows.map((r) => [r.indexname, r.indexdef]));

  const ownerIdx = byName.get("users_one_org_owner_idx");
  record(
    Boolean(ownerIdx?.includes("UNIQUE") && ownerIdx?.includes("ORG_OWNER")),
    "at most one ORG_OWNER per organization (partial unique index)",
  );

  record(
    Boolean(byName.get("consultant_assignments_active_idx")?.includes("UNIQUE")),
    "one active assignment per consultant/customer pair",
  );

  const { rows: userUnique } = await client.query(
    `SELECT conname FROM pg_constraint
      WHERE contype = 'u' AND conrelid = 'public.users'::regclass`,
  );
  const names = userUnique.map((r) => r.conname);
  record(names.includes("users_email_unique_per_org"), "users email unique per organization");
  record(
    names.includes("users_id_org_unique"),
    "users (id, organization_id) unique — the composite FK target",
  );
}

async function checkMigrations(client) {
  const { rows } = await client.query(
    `SELECT filename, applied_at FROM schema_migrations ORDER BY filename`,
  );
  record(rows.length > 0, `${rows.length} migration(s) recorded`);
  for (const row of rows) {
    record(true, `  applied ${row.filename}`, row.applied_at.toISOString());
  }
}

async function main() {
  loadLocalEnv();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set. See .env.example.");

  const client = new pg.Client({
    connectionString,
    ssl: process.env.DATABASE_CA_CERT
      ? { ca: process.env.DATABASE_CA_CERT, rejectUnauthorized: true }
      : { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    await checkMigrations(client);
    await checkTables(client);
    await checkEnums(client);
    await checkPlatformBoundary(client);
    await checkCompositeForeignKeys(client);
    await checkUniqueIndexes(client);
  } finally {
    await client.end();
  }

  for (const { ok, label, detail } of results) {
    console.log(`${ok ? "  ok  " : "FAIL  "}${label}${detail ? `  — ${detail}` : ""}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

  if (failed.length > 0) {
    console.error(`\n${failed.length} check(s) FAILED. The schema does not carry the`);
    console.error(`invariants the ADRs depend on — do not proceed to Phase 2.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
