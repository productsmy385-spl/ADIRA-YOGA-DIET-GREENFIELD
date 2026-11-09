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
 * It creates an account row and emails a Clerk invitation (ADR-015). It does NOT create a
 * credential: the account is left INVITED, and whoever claims it must prove control of
 * the address through Clerk rather than inheriting a password typed on a command line.
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
import { sslFor } from "./lib/db-ssl.mjs";

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

/**
 * Email a Clerk invitation (ADR-015), landing on /sign-up?for=platform so acceptance goes
 * on to the PLATFORM check. Best-effort: the account row is what matters, and without the
 * email the owner can still sign in at /super-admin/sign-in with this address.
 *
 * Plain REST rather than the SDK, so this script keeps depending only on `pg`. The secret
 * key goes in the Authorization header and is never printed.
 */
async function sendInvitation(email) {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const appUrl = process.env.APP_URL;
  if (!secretKey || !appUrl) {
    console.log(
      `\nNo invitation email sent: CLERK_SECRET_KEY and APP_URL must both be set.` +
        `\nThe owner can still sign in at ${appUrl ?? "<APP_URL>"}/super-admin/sign-in.`,
    );
    return;
  }

  const response = await fetch("https://api.clerk.com/v1/invitations", {
    method: "POST",
    headers: { authorization: `Bearer ${secretKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      email_address: email,
      redirect_url: new URL("/sign-up?for=platform", appUrl).toString(),
      notify: true,
      ignore_existing: true,
    }),
  });

  if (response.ok) {
    console.log(`\nInvitation email sent to ${email} via Clerk.`);
  } else {
    // Status only. Clerk's error body describes the request, but there is no need to
    // print anything that could one day echo configuration back.
    console.log(
      `\nClerk refused the invitation (HTTP ${response.status}). The account exists; the` +
        `\nowner can still sign in at ${appUrl}/super-admin/sign-in with this address.`,
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
    ssl: sslFor(connectionString),
  });

  await client.connect();

  try {
    const existing = await client.query(
      "SELECT id, full_name, status, created_at FROM owner_accounts WHERE email = $1",
      [args.email],
    );

    if (existing.rowCount > 0) {
      const account = existing.rows[0];
      console.log(`Platform owner already exists — not creating another.`);
      console.log(`  id      ${account.id}`);
      console.log(`  name    ${account.full_name}`);
      console.log(`  status  ${account.status}`);
      console.log(`  created ${account.created_at.toISOString()}`);
      // Still INVITED means they never accepted: re-running is how to resend the email.
      if (account.status === "INVITED") await sendInvitation(args.email);
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
    console.log(`\nNo credential was created here. Clerk proves the address on first sign-in.`);

    await sendInvitation(args.email);
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
