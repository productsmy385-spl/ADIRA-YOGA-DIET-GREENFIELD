/**
 * A read-only snapshot of the database, for taking before and after a migration.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * STRICTLY READ-ONLY, ENFORCED BY POSTGRESQL
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Everything runs inside `BEGIN READ ONLY`, so the server rejects any write with 25006 —
 * the guarantee is PostgreSQL's, not this file's good intentions. It is safe to point at
 * production, which is the entire reason it exists: the thing you most want before a
 * migration is a record of what was true beforehand, and reaching for that record must
 * not itself be a risk.
 *
 * Usage:
 *
 *   node scripts/production-baseline.mjs                    print a report
 *   node scripts/production-baseline.mjs --json             machine-readable
 *   node scripts/production-baseline.mjs --json > before.json
 *   ... deploy ...
 *   node scripts/production-baseline.mjs --json > after.json
 *   node scripts/production-baseline.mjs --compare before.json
 *
 * `--compare` is the point. "The migration did what we expected" is a claim about a
 * DIFFERENCE, and eyeballing two reports is how a changed row count gets missed.
 */

import { readFileSync } from "node:fs";
import { Client } from "pg";

/* ── configuration ─────────────────────────────────────────────────────── */

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
const asJson = args.includes("--json");
const compareIndex = args.indexOf("--compare");
const comparePath = compareIndex >= 0 ? args[compareIndex + 1] : null;

/* ── the snapshot ──────────────────────────────────────────────────────── */

/**
 * Counts worth having before a migration.
 *
 * Deliberately COUNTS and role/status breakdowns, never row contents. A baseline file is
 * something people paste into tickets and chat; one containing member email addresses or
 * health data would be a disclosure, and a count answers the question just as well.
 */
async function snapshot(client) {
  const one = async (sql, params = []) => (await client.query(sql, params)).rows;

  const [{ db }] = await one("SELECT current_database() AS db");
  const [{ version }] = await one("SELECT version() AS version");

  const migrations = (
    await one("SELECT filename FROM schema_migrations ORDER BY filename")
  ).map((row) => row.filename);

  const enums = Object.fromEntries(
    (
      await one(
        `SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] AS labels
           FROM pg_type t
           JOIN pg_enum e ON e.enumtypid = t.oid
           JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'public'
          GROUP BY t.typname
          ORDER BY t.typname`,
      )
    ).map((row) => [row.typname, row.labels]),
  );

  // Every public table, counted. Derived rather than listed, so a table added by the
  // migration under test appears in the "after" snapshot instead of being invisible.
  const tables = (
    await one(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    )
  ).map((row) => row.tablename);

  const counts = {};
  for (const table of tables) {
    // The identifier comes from pg_tables, not from user input, and is quoted anyway.
    const [{ n }] = await one(`SELECT count(*)::int AS n FROM public."${table}"`);
    counts[table] = n;
  }

  const rolesByStatus = await one(
    `SELECT role::text AS role, status::text AS status, count(*)::int AS n
       FROM users GROUP BY 1, 2 ORDER BY 1, 2`,
  );

  const sessions = await one(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE revoked_at IS NULL AND expires_at > now())::int AS live
       FROM sessions`,
  );

  const assignments = await one(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE ended_at IS NULL)::int AS active
       FROM consultant_assignments`,
  );

  const auditByAction = await one(
    `SELECT action, count(*)::int AS n FROM audit_logs GROUP BY 1 ORDER BY 2 DESC, 1`,
  );

  const indexes = (
    await one(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname`,
    )
  ).map((row) => row.indexname);

  // Named explicitly because 007 drops it and its absence is how you confirm 007 ran.
  const singleOwnerIndex = indexes.includes("users_one_org_owner_idx");

  const programmes = await one(
    `SELECT name, kind::text AS kind FROM programmes ORDER BY name`,
  );

  return {
    takenAt: new Date().toISOString(),
    database: db,
    postgres: version.split(" ").slice(0, 2).join(" "),
    migrations,
    enums,
    counts,
    rolesByStatus,
    sessions: sessions[0],
    assignments: assignments[0],
    auditByAction,
    indexCount: indexes.length,
    singleOwnerIndex,
    programmes,
  };
}

/* ── reporting ─────────────────────────────────────────────────────────── */

function printReport(s) {
  const line = (label, value) => console.log(`  ${label.padEnd(28)} ${value}`);

  console.log(`\nBASELINE — ${s.database} (${s.postgres})`);
  console.log(`  taken ${s.takenAt}\n`);

  console.log("MIGRATIONS APPLIED");
  for (const m of s.migrations) console.log(`  ${m}`);

  console.log("\nROLES");
  if (s.rolesByStatus.length === 0) console.log("  (no users)");
  for (const r of s.rolesByStatus) line(`${r.role} / ${r.status}`, r.n);

  console.log("\nKEY COUNTS");
  line("organizations", s.counts.organizations ?? 0);
  line("users", s.counts.users ?? 0);
  line("sessions (total / live)", `${s.sessions.total} / ${s.sessions.live}`);
  line("assignments (total / active)", `${s.assignments.total} / ${s.assignments.active}`);
  line("audit_logs", s.counts.audit_logs ?? 0);
  line("programmes", s.counts.programmes ?? 0);
  line("daily_activities", s.counts.daily_activities ?? 0);
  line("notifications", s.counts.notifications ?? 0);
  line("access_requests", s.counts.access_requests ?? "(table does not exist)");

  console.log("\nENUMS THAT MATTER");
  line("tenant_role", (s.enums.tenant_role ?? []).join(", "));
  line("notification_kind", (s.enums.notification_kind ?? []).join(", "));
  line("access_request_status", (s.enums.access_request_status ?? ["(absent)"]).join(", "));

  console.log("\nSTRUCTURE");
  line("indexes", s.indexCount);
  line("users_one_org_owner_idx", s.singleOwnerIndex ? "present" : "absent");

  console.log("\nPROGRAMMES");
  for (const p of s.programmes) console.log(`  ${p.kind.padEnd(6)} ${p.name}`);
  console.log();
}

function compare(before, after) {
  const changes = [];
  const note = (what, from, to) => {
    if (JSON.stringify(from) !== JSON.stringify(to)) changes.push({ what, from, to });
  };

  note("migrations", before.migrations, after.migrations);
  note("tenant_role", before.enums.tenant_role, after.enums.tenant_role);
  note("notification_kind", before.enums.notification_kind, after.enums.notification_kind);
  note("users_one_org_owner_idx", before.singleOwnerIndex, after.singleOwnerIndex);
  note("roles", before.rolesByStatus, after.rolesByStatus);
  note("assignments", before.assignments, after.assignments);

  for (const table of new Set([
    ...Object.keys(before.counts),
    ...Object.keys(after.counts),
  ])) {
    note(`count:${table}`, before.counts[table] ?? null, after.counts[table] ?? null);
  }

  const beforeAudit = Object.fromEntries(before.auditByAction.map((r) => [r.action, r.n]));
  const afterAudit = Object.fromEntries(after.auditByAction.map((r) => [r.action, r.n]));
  for (const action of new Set([...Object.keys(beforeAudit), ...Object.keys(afterAudit)])) {
    note(`audit:${action}`, beforeAudit[action] ?? 0, afterAudit[action] ?? 0);
  }

  console.log(`\nCOMPARISON — ${before.takenAt}  →  ${after.takenAt}\n`);
  if (changes.length === 0) {
    console.log("  No differences.\n");
    return;
  }
  for (const c of changes) {
    console.log(`  ${c.what}`);
    console.log(`    before: ${JSON.stringify(c.from)}`);
    console.log(`    after:  ${JSON.stringify(c.to)}`);
  }
  console.log();
}

/* ── main ──────────────────────────────────────────────────────────────── */

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: process.env.DATABASE_CA_CERT
    ? { ca: process.env.DATABASE_CA_CERT, rejectUnauthorized: true }
    : { rejectUnauthorized: false },
});

await client.connect();

let current;
try {
  await client.query("BEGIN READ ONLY");
  current = await snapshot(client);
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.end();
}

if (comparePath) {
  compare(JSON.parse(readFileSync(comparePath, "utf8")), current);
} else if (asJson) {
  console.log(JSON.stringify(current, null, 2));
} else {
  printReport(current);
}
