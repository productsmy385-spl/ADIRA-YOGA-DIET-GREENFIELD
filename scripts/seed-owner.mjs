#!/usr/bin/env node
/**
 * Bootstrap the first PLATFORM_OWNER.
 *
 * ADR-001 puts platform accounts in their own identity domain, deliberately unreachable
 * from the tenant surface: `canAssignRole` refuses PLATFORM_OWNER at any rank, and there
 * is no API that creates one. That is the correct design, and it leaves exactly one
 * problem — the very first platform account has no way to exist. This script is that
 * way in, and it is intended to be run by a human with database access, not by the
 * application.
 *
 * It creates an account row only. It does NOT create a credential: authentication is
 * Phase 2, and the account is left at status INVITED so that whoever claims it must go
 * through passkey enrolment rather than inheriting a password someone typed on a
 * command line.
 *
 * Idempotent — running it twice reports the existing account rather than failing or
 * creating a duplicate.
 *
 * Usage:
 *   node scripts/seed-owner.mjs --email you@example.com --name "Your Name"
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    try {
      process.loadEnvFile(path);
      return;
    } catch {
      // Already-present environment variables are enough.
    }
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--email") args.email = argv[i + 1];
    if (argv[i] === "--name") args.name = argv[i + 1];
  }
  return args;
}

function validate({ email, name }) {
  const problems = [];

  if (!email) {
    problems.push("--email is required");
  } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    problems.push(`--email "${email}" is not a valid address`);
  } else if (email !== email.toLowerCase()) {
    // The column carries CHECK (email = lower(email)). Failing here with an explanation
    // beats failing later with a constraint-violation stack trace.
    problems.push(`--email must be lowercase (did you mean "${email.toLowerCase()}"?)`);
  }

  if (!name || name.trim().length === 0) problems.push("--name is required");

  if (problems.length > 0) {
    throw new Error(
      `${problems.join("\n  - ")}\n\nUsage:\n` +
        `  node scripts/seed-owner.mjs --email you@example.com --name "Your Name"`,
    );
  }
}

async function main() {
  loadLocalEnv();

  const args = parseArgs(process.argv.slice(2));
  validate(args);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. See .env.example.");
  }

  const client = new pg.Client({
    connectionString,
    ssl: process.env.DATABASE_CA_CERT
      ? { ca: process.env.DATABASE_CA_CERT, rejectUnauthorized: true }
      : { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    const existing = await client.query(
      "SELECT id, full_name, status, created_at FROM owner_accounts WHERE email = $1",
      [args.email],
    );

    if (existing.rowCount > 0) {
      const account = existing.rows[0];
      console.log(`Platform owner already exists — nothing to do.`);
      console.log(`  id      ${account.id}`);
      console.log(`  name    ${account.full_name}`);
      console.log(`  status  ${account.status}`);
      console.log(`  created ${account.created_at.toISOString()}`);
      return;
    }

    // The insert and its audit entry are one unit of work: an owner account that came
    // into existence with no record of who created it is exactly the thing the audit
    // log exists to prevent.
    await client.query("BEGIN");

    const { rows } = await client.query(
      `INSERT INTO owner_accounts (email, full_name, status)
       VALUES ($1, $2, 'INVITED')
       RETURNING id, created_at`,
      [args.email, args.name.trim()],
    );

    const account = rows[0];

    await client.query(
      `INSERT INTO audit_logs
         (organization_id, actor_domain, actor_id, actor_label, action, resource_type,
          resource_id, outcome, metadata)
       VALUES (NULL, 'PLATFORM', NULL, $1, 'owner_account.seeded', 'owner_account',
               $2, 'SUCCESS', $3::jsonb)`,
      [
        // No actor id: this was run from a shell by whoever holds database credentials,
        // not by an authenticated principal. Recording the mechanism is the honest
        // alternative to inventing an actor.
        "scripts/seed-owner.mjs",
        account.id,
        JSON.stringify({ email: args.email, via: "cli" }),
      ],
    );

    await client.query("COMMIT");

    console.log(`Created platform owner.`);
    console.log(`  id      ${account.id}`);
    console.log(`  email   ${args.email}`);
    console.log(`  status  INVITED`);
    console.log(
      `\nNo credential was created. Passkey enrolment arrives in Phase 2; until then this` +
        `\naccount cannot sign in, because there is nothing to sign in with yet.`,
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
