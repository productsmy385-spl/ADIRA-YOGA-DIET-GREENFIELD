#!/usr/bin/env node
/**
 * Create an organization and its ORG_OWNER.
 *
 * The tenant-side counterpart to seed-owner.mjs, and it exists for the same reason: an
 * organization can only be created by a platform owner, the platform console that would
 * do that is not built yet, and until one organization exists there is nobody who can
 * sign in to the tenant surface at all. This is the documented way in until Phase 9
 * replaces it.
 *
 * It creates exactly two rows — one `organizations`, one `users` with role ORG_OWNER —
 * inside one transaction, plus the audit entries. It creates no credential: the account
 * proves itself with a one-time code (or a passkey) on first sign-in, so nothing
 * sign-in-worthy is ever typed on a command line or left in shell history.
 *
 * Idempotent. Running it twice reports what already exists rather than failing on the
 * unique constraints or creating a second organization with a suffixed slug.
 *
 * Usage:
 *   node scripts/seed-organization.mjs \
 *     --name "Anand Yoga Studio" \
 *     --slug anand-yoga \
 *     --owner-email owner@example.com \
 *     --owner-name "Gopala Krishna"
 *
 *   --invited   create the owner as INVITED rather than ACTIVE
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
  const args = { invited: argv.includes("--invited") };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--name") args.name = argv[i + 1];
    if (argv[i] === "--slug") args.slug = argv[i + 1];
    if (argv[i] === "--owner-email") args.ownerEmail = argv[i + 1];
    if (argv[i] === "--owner-name") args.ownerName = argv[i + 1];
  }
  return args;
}

/**
 * Validate before touching the database.
 *
 * Every rule here mirrors a CHECK constraint in 001_foundation.sql. Failing at the
 * constraint would work, but the message would be a driver-level violation naming an
 * index — this way the person running it is told what to type instead.
 */
function validate(args) {
  const problems = [];

  if (!args.name || args.name.trim().length === 0) problems.push("--name is required");

  if (!args.slug) {
    problems.push("--slug is required");
  } else if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(args.slug)) {
    problems.push(
      `--slug "${args.slug}" must be lowercase letters, digits and hyphens, ` +
        `starting and ending with a letter or digit`,
    );
  }

  if (!args.ownerEmail) {
    problems.push("--owner-email is required");
  } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(args.ownerEmail)) {
    problems.push(`--owner-email "${args.ownerEmail}" is not a valid address`);
  } else if (args.ownerEmail !== args.ownerEmail.toLowerCase()) {
    // The column carries CHECK (email = lower(email)).
    problems.push(
      `--owner-email must be lowercase (did you mean "${args.ownerEmail.toLowerCase()}"?)`,
    );
  }

  if (!args.ownerName || args.ownerName.trim().length === 0) {
    problems.push("--owner-name is required");
  }

  if (problems.length > 0) {
    throw new Error(
      `  - ${problems.join("\n  - ")}\n\nUsage:\n` +
        `  node scripts/seed-organization.mjs --name "Studio" --slug studio \\\n` +
        `    --owner-email owner@example.com --owner-name "Full Name"`,
    );
  }
}

async function main() {
  loadLocalEnv();

  const args = parseArgs(process.argv.slice(2));
  validate(args);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set. See .env.example.");

  const client = new pg.Client({
    connectionString,
    ssl: process.env.DATABASE_CA_CERT
      ? { ca: process.env.DATABASE_CA_CERT, rejectUnauthorized: true }
      : { rejectUnauthorized: false },
  });

  await client.connect();

  const status = args.invited ? "INVITED" : "ACTIVE";

  try {
    const existingOrg = await client.query(
      "SELECT id, name, status FROM organizations WHERE slug = $1",
      [args.slug],
    );

    if (existingOrg.rowCount > 0) {
      const org = existingOrg.rows[0];
      console.log(`Organization "${args.slug}" already exists — nothing created.`);
      console.log(`  id      ${org.id}`);
      console.log(`  name    ${org.name}`);
      console.log(`  status  ${org.status}`);

      const owner = await client.query(
        "SELECT id, email, role, status FROM users WHERE organization_id = $1 AND role = 'ORG_OWNER'",
        [org.id],
      );

      if (owner.rowCount > 0) {
        console.log(`\nIts owner:`);
        console.log(`  email   ${owner.rows[0].email}`);
        console.log(`  status  ${owner.rows[0].status}`);
      } else {
        console.log(`\nIt has no ORG_OWNER. That is a broken state — see docs/RBAC.md.`);
      }
      return;
    }

    // Organization and its owner are one unit of work. An organization with no ORG_OWNER
    // is unreachable: nobody can sign in to administer it, and the partial unique index
    // means the row cannot simply be added later by whoever happens to notice.
    await client.query("BEGIN");

    const orgResult = await client.query(
      `INSERT INTO organizations (name, slug, status)
       VALUES ($1, $2, 'ACTIVE')
       RETURNING id, created_at`,
      [args.name.trim(), args.slug],
    );

    const organization = orgResult.rows[0];

    const userResult = await client.query(
      `INSERT INTO users (organization_id, email, full_name, role, status)
       VALUES ($1, $2, $3, 'ORG_OWNER', $4)
       RETURNING id`,
      [organization.id, args.ownerEmail, args.ownerName.trim(), status],
    );

    const owner = userResult.rows[0];

    await client.query(
      `INSERT INTO audit_logs
         (organization_id, actor_domain, actor_id, actor_label, action, resource_type,
          resource_id, outcome, metadata)
       VALUES ($1, 'PLATFORM', NULL, $2, 'organization.seeded', 'organization', $3,
               'SUCCESS', $4::jsonb)`,
      [
        organization.id,
        // No actor id: run from a shell by whoever holds database credentials, not by an
        // authenticated principal. Recording the mechanism is the honest alternative to
        // inventing an actor.
        "scripts/seed-organization.mjs",
        organization.id,
        JSON.stringify({ slug: args.slug, via: "cli" }),
      ],
    );

    await client.query(
      `INSERT INTO audit_logs
         (organization_id, actor_domain, actor_id, actor_label, action, resource_type,
          resource_id, outcome, metadata)
       VALUES ($1, 'PLATFORM', NULL, $2, 'user.seeded', 'user', $3, 'SUCCESS', $4::jsonb)`,
      [
        organization.id,
        "scripts/seed-organization.mjs",
        owner.id,
        JSON.stringify({ email: args.ownerEmail, role: "ORG_OWNER", status, via: "cli" }),
      ],
    );

    await client.query("COMMIT");

    console.log(`Created organization and owner.`);
    console.log(`  organization  ${organization.id}`);
    console.log(`  name          ${args.name.trim()}`);
    console.log(`  slug          ${args.slug}`);
    console.log(`  owner         ${args.ownerEmail}`);
    console.log(`  owner id      ${owner.id}`);
    console.log(`  owner status  ${status}`);
    console.log(
      `\nNo credential was created. Sign in at /sign-in with that address; the ` +
        `one-time\ncode is emailed where Resend is configured, and printed to the ` +
        `server console\nin development.`,
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
