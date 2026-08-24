import { expect, it } from "vitest";

import { currentDatabaseName, describeReadOnly, readOnly } from "./helpers/sql-db";

/**
 * The schema contract, verified against the database the application actually uses.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS SUITE EXISTS, AND WHAT IT REPLACED
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `tenant-isolation.test.ts` proved the tenancy constraints by trying to write rows that
 * must be refused. That is the stronger proof and it needs a database it may destroy —
 * which this project has decided not to maintain, so those suites now skip themselves.
 *
 * This suite recovers the part of that coverage that does not require writing: the
 * constraints are PRESENT IN THE APPLIED SCHEMA. It cannot prove PostgreSQL enforces
 * them — that is PostgreSQL's job and it does not have bugs of that shape — but it can
 * prove nobody shipped a migration that dropped one, which is the failure mode that
 * actually happens.
 *
 * EVERY STATEMENT RUNS INSIDE `BEGIN READ ONLY`. The database refuses writes from this
 * transaction, so the suite is safe against production by the server's rule rather than
 * by this file's good intentions. See `tests/helpers/sql-db.ts`.
 *
 * WHAT IS *NOT* HERE: whether the database is at the revision this code requires. That is
 * a deployment fact rather than a structural one, and it lives in
 * `migration-readiness.test.ts` so that "the schema is sound" and "the deployment is up to
 * date" cannot be confused for one another — they fail for different reasons and are
 * fixed by different people.
 */

/* ── the invariants, stated as data ────────────────────────────────────── */

/**
 * Tables whose `organization_id` must be NOT NULL.
 *
 * These hold tenant data. A nullable tenant column is a row that belongs to nobody, which
 * every org-scoped query then either drops or, worse, returns to everybody.
 */
const TENANT_TABLES = [
  "assignment_items",
  "assignments",
  "consultant_assignments",
  "daily_activities",
  "daily_checkins",
  "meals",
  "media_assets",
  "notification_preferences",
  "notifications",
  "programme_items",
  "programmes",
  "push_subscriptions",
  "reports",
  "sessions",
  "users",
  "yoga_exercises",
] as const;

/**
 * Tables where `organization_id` is deliberately nullable, and why.
 *
 * Listed explicitly so that a NEW nullable tenant column fails the test above rather than
 * joining a silent exemption list. Each of these can legitimately exist before, or
 * outside, any organization.
 */
const NULLABLE_BY_DESIGN: Record<string, string> = {
  audit_logs: "platform-domain actions have no organization",
  jobs: "some jobs are platform-wide",
  otp_challenges: "a challenge can precede organization resolution (ADR-012)",
  passkey_credentials: "a platform owner's passkey belongs to no tenant",
  webauthn_challenges: "same as passkey_credentials",
};

/**
 * The composite foreign keys that make a cross-tenant row UNREPRESENTABLE (ADR-004).
 *
 * Each references `users (id, organization_id)`, so a row can only point at a user in the
 * same organization as itself. Application scoping is a check somebody eventually
 * forgets; this is not.
 *
 * `consultant_assignments` is the one to care about most: without its two, a consultant
 * in one studio could be linked to a customer in another — the single worst outcome this
 * product can produce.
 */
const COMPOSITE_USER_FKS = [
  "assignments_customer_fk",
  "assignments_assigner_fk",
  "consultant_assignments_customer_fk",
  "consultant_assignments_consultant_fk",
  "daily_activities_customer_fk",
  "daily_checkins_customer_fk",
  "media_assets_customer_fk",
  "media_assets_uploader_fk",
  "notification_preferences_user_fk",
  "notifications_sender_fk",
  "notifications_recipient_fk",
  "otp_user_fk",
  "passkey_user_fk",
  "push_subscriptions_user_fk",
  "reports_customer_fk",
  "sessions_user_fk",
  "webauthn_user_fk",
] as const;

/* ── the suite ─────────────────────────────────────────────────────────── */

describeReadOnly("schema contract", () => {
  it("reports which database it verified", async () => {
    // Not an assertion about WHICH database — local development points at production by
    // design here. It is in the output so a passing run says what it proved it against.
    const name = await currentDatabaseName();
    expect(name).toBeTruthy();
    console.log(`  schema contract verified against database: ${name}`);
  });

  it("refuses to write, enforced by PostgreSQL rather than by convention", async () => {
    /*
     * The guarantee this whole suite rests on. If `BEGIN READ ONLY` ever stopped being
     * applied, every other test here would silently become capable of mutating
     * production — so the harness is tested rather than assumed.
     *
     * `WHERE false` makes the probe safe TWICE OVER: PostgreSQL rejects any UPDATE in a
     * read-only transaction before predicates matter (25006), and if the guard were
     * broken the statement still matches no row. A probe that could write if it escaped
     * is not a probe worth running against production.
     */
    await expect(
      readOnly(async (client) => {
        await client.query("UPDATE organizations SET name = name WHERE false");
      }),
    ).rejects.toThrow(/read-only transaction/i);
  });

  it("keeps organization_id NOT NULL on every tenant table", async () => {
    const columns = await readOnly(async (client) => {
      const { rows } = await client.query<{ table_name: string; is_nullable: string }>(
        `SELECT table_name, is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'public' AND column_name = 'organization_id'`,
      );
      return new Map(rows.map((row) => [row.table_name, row.is_nullable]));
    });

    for (const table of TENANT_TABLES) {
      expect(columns.get(table), `${table}.organization_id is missing`).toBeDefined();
      expect(columns.get(table), `${table}.organization_id must be NOT NULL`).toBe("NO");
    }
  });

  it("has no nullable organization_id outside the documented exemptions", async () => {
    // The important direction. A new table arriving with a nullable tenant column is the
    // regression; the list above is what stops it being absorbed silently.
    const nullable = await readOnly(async (client) => {
      const { rows } = await client.query<{ table_name: string }>(
        `SELECT table_name
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND column_name = 'organization_id'
            AND is_nullable = 'YES'`,
      );
      return rows.map((row) => row.table_name).sort();
    });

    expect(nullable).toEqual(Object.keys(NULLABLE_BY_DESIGN).sort());
  });

  it("keeps the composite unique key the cross-tenant foreign keys target", async () => {
    const present = await readOnly(async (client) => {
      const { rows } = await client.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint
          WHERE conrelid = 'public.users'::regclass AND contype = 'u'`,
      );
      return rows.map((row) => row.conname);
    });

    // Redundant against the primary key, and load-bearing anyway: without it PostgreSQL
    // cannot accept (id, organization_id) as a foreign-key target at all.
    expect(present).toContain("users_id_org_unique");
    expect(present).toContain("users_email_unique_per_org");
  });

  it("keeps every composite foreign key that makes cross-tenant rows unrepresentable", async () => {
    const found = await readOnly(async (client) => {
      const { rows } = await client.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint
          WHERE contype = 'f'
            AND confrelid = 'public.users'::regclass
            AND array_length(conkey, 1) = 2`,
      );
      return new Set(rows.map((row) => row.conname));
    });

    const missing = COMPOSITE_USER_FKS.filter((name) => !found.has(name));
    expect(missing, "composite foreign keys dropped from the applied schema").toEqual([]);
  });

  it("keeps owner_accounts free of any organization column", async () => {
    // ADR-001. The ABSENCE is the platform boundary: a platform owner belongs to no
    // tenant, and adding the column would make it possible to express one who does.
    const columns = await readOnly(async (client) => {
      const { rows } = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'owner_accounts'`,
      );
      return rows.map((row) => row.column_name);
    });

    expect(columns.length).toBeGreaterThan(0);
    expect(columns).not.toContain("organization_id");
  });

  it("leads an index with organization_id on every directly-queried tenant table", async () => {
    /*
     * Every org-scoped query filters on organization_id first, so an index that does not
     * lead with it cannot serve that filter.
     *
     * CHILD TABLES ARE EXEMPT, and legitimately so: `assignment_items` and
     * `programme_items` are always reached through their parent and index by
     * `(parent_id, week, day, sequence)`, while `sessions` is looked up by token hash.
     * Demanding an organization_id-leading index there would be cargo cult — it would
     * serve no query the application makes.
     */
    const DIRECTLY_QUERIED_BY_ORG = [
      "assignments",
      "consultant_assignments",
      "daily_activities",
      "daily_checkins",
      "meals",
      "media_assets",
      "notifications",
      "programmes",
      "reports",
      "users",
      "yoga_exercises",
    ];

    const leading = await readOnly(async (client) => {
      const { rows } = await client.query<{ tbl: string; col: string }>(
        `SELECT c.relname AS tbl, a.attname AS col
           FROM pg_index x
           JOIN pg_class c ON c.oid = x.indrelid
           JOIN pg_class i ON i.oid = x.indexrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = x.indkey[0]
          WHERE n.nspname = 'public' AND c.relname = ANY($1)`,
        [DIRECTLY_QUERIED_BY_ORG],
      );
      return rows;
    });

    const missing = DIRECTLY_QUERIED_BY_ORG.filter(
      (table) =>
        !leading.some((row) => row.tbl === table && row.col === "organization_id"),
    );

    expect(missing, "tenant tables with no organization_id-leading index").toEqual([]);
  });
});
