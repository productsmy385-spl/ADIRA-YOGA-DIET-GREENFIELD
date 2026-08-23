import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { canActOn, canAssignRole } from "@/server/authorization/permissions";
import type { TenantActor } from "@/server/authorization/roles";
import { query } from "@/server/db/pool";
import { createOrganization } from "@/server/repositories/organizations";
import { createUser, findUserById, listUsers } from "@/server/repositories/users";

import { getTestPool, hasTestDatabase, resetDatabase } from "./helpers/sql-db";

/**
 * The suite `docs/TESTING.md` named as required before Phase 3 can be called done.
 *
 * These are the guarantees the whole product rests on: a customer must not reach another
 * customer, and an organisation must not reach another organisation. Everything else
 * Adira does is a feature; this is the thing that makes it safe to hold health data for
 * more than one client.
 *
 * The tests are deliberately split between two levels, because they fail differently:
 *
 *   - REPOSITORY level — scoping the application performs. A bug here looks like a
 *     forgotten WHERE clause and is caught by a returned row that should not exist.
 *   - DATABASE level — constraints PostgreSQL enforces (ADR-004). A bug here is not
 *     possible to write; the insert is refused. These tests prove the constraints are
 *     actually present in the applied schema rather than merely intended.
 *
 * The second set is the one worth having. Application scoping is a check somebody
 * eventually forgets; a composite foreign key is not.
 */

const describeWithDatabase = hasTestDatabase ? describe : describe.skip;

interface Fixture {
  orgA: string;
  orgB: string;
  ownerA: string;
  adminA: string;
  customerA: string;
  customerB: string;
  adminB: string;
}

async function seed(): Promise<Fixture> {
  const a = await createOrganization({ name: "Studio A", slug: "studio-a" });
  const b = await createOrganization({ name: "Studio B", slug: "studio-b" });

  const mk = async (orgId: string, role: "ORG_OWNER" | "ADMIN" | "CUSTOMER", email: string) =>
    (
      await createUser({
        organizationId: orgId,
        email,
        fullName: email,
        role,
        status: "ACTIVE",
      })
    ).id;

  return {
    orgA: a.id,
    orgB: b.id,
    ownerA: await mk(a.id, "ORG_OWNER", "owner@a.test"),
    adminA: await mk(a.id, "ADMIN", "admin@a.test"),
    customerA: await mk(a.id, "CUSTOMER", "customer@a.test"),
    adminB: await mk(b.id, "ADMIN", "admin@b.test"),
    customerB: await mk(b.id, "CUSTOMER", "customer@b.test"),
  };
}

describeWithDatabase("tenant isolation", () => {
  let f: Fixture;

  beforeAll(async () => {
    // Fail loudly rather than silently truncating the wrong database.
    const { rows } = await getTestPool().query<{ db: string }>(
      "SELECT current_database() AS db",
    );
    expect(rows[0].db).not.toBe("railway");
  });

  beforeEach(async () => {
    await resetDatabase();
    f = await seed();
  });

  // -------------------------------------------------------------------------
  // Enforced by PostgreSQL — these rows cannot be written at all
  // -------------------------------------------------------------------------

  describe("the database refuses cross-tenant rows", () => {
    /**
     * The composite foreign key from ADR-004. Without it this insert would succeed and
     * a consultant in Studio A would be linked to a customer in Studio B — the single
     * worst outcome this product can produce.
     */
    it("refuses a consultant_assignment spanning two organizations", async () => {
      await expect(
        query(
          `INSERT INTO consultant_assignments (organization_id, consultant_id, customer_id)
           VALUES ($1, $2, $3)`,
          [f.orgA, f.adminA, f.customerB],
        ),
      ).rejects.toThrow();
    });

    it("refuses an assignment whose organization matches neither party", async () => {
      await expect(
        query(
          `INSERT INTO consultant_assignments (organization_id, consultant_id, customer_id)
           VALUES ($1, $2, $3)`,
          [f.orgB, f.adminA, f.customerA],
        ),
      ).rejects.toThrow();
    });

    it("accepts an assignment within one organization", async () => {
      await expect(
        query(
          `INSERT INTO consultant_assignments (organization_id, consultant_id, customer_id)
           VALUES ($1, $2, $3)`,
          [f.orgA, f.adminA, f.customerA],
        ),
      ).resolves.toBeDefined();
    });

    /**
     * A session carries a denormalised organization_id. If that could disagree with the
     * user's real organization, every authorization decision downstream would be reading
     * a lie — the session is where tenant scope comes from.
     */
    it("refuses a session whose organization is not the user's", async () => {
      await expect(
        query(
          `INSERT INTO sessions (user_id, organization_id, token_hash, expires_at)
           VALUES ($1, $2, $3, now() + interval '1 day')`,
          [f.customerA, f.orgB, Buffer.from("x".repeat(32))],
        ),
      ).rejects.toThrow();
    });

    it("refuses a passkey whose organization is not the user's", async () => {
      await expect(
        query(
          `INSERT INTO passkey_credentials
             (user_id, organization_id, credential_id, public_key, counter)
           VALUES ($1, $2, $3, $4, 0)`,
          [f.customerA, f.orgB, Buffer.from("cred-1"), Buffer.from("key")],
        ),
      ).rejects.toThrow();
    });

    // ADR-001: a credential cannot straddle the two identity domains.
    it("refuses a passkey belonging to both a tenant user and a platform account", async () => {
      const owner = await query<{ id: string }>(
        `INSERT INTO owner_accounts (email, full_name) VALUES ($1, $2) RETURNING id`,
        ["platform@test.test", "Platform Owner"],
      );

      await expect(
        query(
          `INSERT INTO passkey_credentials
             (user_id, organization_id, owner_account_id, credential_id, public_key, counter)
           VALUES ($1, $2, $3, $4, $5, 0)`,
          [f.customerA, f.orgA, owner[0].id, Buffer.from("cred-2"), Buffer.from("key")],
        ),
      ).rejects.toThrow();
    });

    /**
     * The domain tables from migration 004. Each carries a customer, so each is a place
     * a cross-tenant row would mean one studio's consultant reading another studio's
     * health records.
     */
    it("refuses an assignment attaching a plan to a customer in another organization", async () => {
      await expect(
        query(
          `INSERT INTO assignments
             (organization_id, customer_id, kind, name, starts_on, duration_weeks)
           VALUES ($1, $2, 'YOGA', 'Foundation', current_date, 4)`,
          [f.orgA, f.customerB],
        ),
      ).rejects.toThrow();
    });

    it("refuses an assignment whose assigner belongs to another organization", async () => {
      await expect(
        query(
          `INSERT INTO assignments
             (organization_id, customer_id, assigned_by, kind, name, starts_on, duration_weeks)
           VALUES ($1, $2, $3, 'YOGA', 'Foundation', current_date, 4)`,
          [f.orgA, f.customerA, f.adminB],
        ),
      ).rejects.toThrow();
    });

    it("refuses a check-in recorded against a customer in another organization", async () => {
      await expect(
        query(
          `INSERT INTO daily_checkins (organization_id, customer_id, checkin_date, mood)
           VALUES ($1, $2, current_date, 3)`,
          [f.orgA, f.customerB],
        ),
      ).rejects.toThrow();
    });

    it("accepts a plan and a check-in within one organization", async () => {
      await expect(
        query(
          `INSERT INTO assignments
             (organization_id, customer_id, assigned_by, kind, name, starts_on, duration_weeks)
           VALUES ($1, $2, $3, 'YOGA', 'Foundation', current_date, 4)`,
          [f.orgA, f.customerA, f.adminA],
        ),
      ).resolves.toBeDefined();

      await expect(
        query(
          `INSERT INTO daily_checkins (organization_id, customer_id, checkin_date, mood)
           VALUES ($1, $2, current_date, 4)`,
          [f.orgA, f.customerA],
        ),
      ).resolves.toBeDefined();
    });

    // A customer with two live yoga plans would have every day double-scheduled, which
    // halves adherence for a reason nobody could find.
    it("refuses a second live plan of the same kind for one customer", async () => {
      const insert = () =>
        query(
          `INSERT INTO assignments
             (organization_id, customer_id, kind, name, starts_on, duration_weeks, status)
           VALUES ($1, $2, 'YOGA', 'Foundation', current_date, 4, 'ACTIVE')`,
          [f.orgA, f.customerA],
        );

      await expect(insert()).resolves.toBeDefined();
      await expect(insert()).rejects.toThrow();
    });

    it("allows one yoga plan and one diet plan at the same time", async () => {
      await query(
        `INSERT INTO assignments
           (organization_id, customer_id, kind, name, starts_on, duration_weeks, status)
         VALUES ($1, $2, 'YOGA', 'Foundation', current_date, 4, 'ACTIVE')`,
        [f.orgA, f.customerA],
      );

      await expect(
        query(
          `INSERT INTO assignments
             (organization_id, customer_id, kind, name, starts_on, duration_weeks, status)
           VALUES ($1, $2, 'DIET', 'Balanced', current_date, 4, 'ACTIVE')`,
          [f.orgA, f.customerA],
        ),
      ).resolves.toBeDefined();
    });

    /**
     * docs/METRICS.md depends on this: a COMPLETED activity with no timestamp would drop
     * out of every time-windowed adherence query while still counting as completed.
     */
    it("refuses a COMPLETED activity with no completion timestamp", async () => {
      const [assignment] = await query<{ id: string }>(
        `INSERT INTO assignments
           (organization_id, customer_id, kind, name, starts_on, duration_weeks, status)
         VALUES ($1, $2, 'YOGA', 'Foundation', current_date, 4, 'ACTIVE') RETURNING id`,
        [f.orgA, f.customerA],
      );

      await expect(
        query(
          `INSERT INTO daily_activities
             (organization_id, customer_id, assignment_id, kind, scheduled_for, status)
           VALUES ($1, $2, $3, 'YOGA', current_date, 'COMPLETED')`,
          [f.orgA, f.customerA, assignment.id],
        ),
      ).rejects.toThrow();
    });

    it("refuses an activity whose customer belongs to another organization", async () => {
      const [assignment] = await query<{ id: string }>(
        `INSERT INTO assignments
           (organization_id, customer_id, kind, name, starts_on, duration_weeks, status)
         VALUES ($1, $2, 'YOGA', 'Foundation', current_date, 4, 'ACTIVE') RETURNING id`,
        [f.orgA, f.customerA],
      );

      await expect(
        query(
          `INSERT INTO daily_activities
             (organization_id, customer_id, assignment_id, kind, scheduled_for)
           VALUES ($1, $2, $3, 'YOGA', current_date)`,
          [f.orgA, f.customerB, assignment.id],
        ),
      ).rejects.toThrow();
    });

    it("refuses a second check-in for the same customer on the same day", async () => {
      const insert = () =>
        query(
          `INSERT INTO daily_checkins (organization_id, customer_id, checkin_date, mood)
           VALUES ($1, $2, current_date, 3)`,
          [f.orgA, f.customerA],
        );

      await expect(insert()).resolves.toBeDefined();
      await expect(insert()).rejects.toThrow();
    });

    it("refuses a second ORG_OWNER in the same organization", async () => {
      await expect(
        createUser({
          organizationId: f.orgA,
          email: "owner2@a.test",
          fullName: "Second Owner",
          role: "ORG_OWNER",
          status: "ACTIVE",
        }),
      ).rejects.toThrow();
    });

    // Email is unique PER ORGANISATION, not globally — the same person may genuinely be
    // a customer at one studio and a consultant at another.
    it("allows the same email address in two different organizations", async () => {
      const shared = "same.person@example.test";
      await createUser({
        organizationId: f.orgA,
        email: shared,
        fullName: "Same Person",
        role: "CUSTOMER",
      });

      await expect(
        createUser({
          organizationId: f.orgB,
          email: shared,
          fullName: "Same Person",
          role: "CUSTOMER",
        }),
      ).resolves.toBeDefined();
    });

    it("refuses the same email twice within one organization", async () => {
      await expect(
        createUser({
          organizationId: f.orgA,
          email: "customer@a.test",
          fullName: "Duplicate",
          role: "CUSTOMER",
        }),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Enforced by the repository layer
  // -------------------------------------------------------------------------

  describe("repositories scope every read by organization", () => {
    /**
     * The IDOR case, at the layer where it would actually happen: an attacker who has
     * learned another customer's UUID and presents it with their own session.
     */
    it("returns null for a real user id looked up under the wrong organization", async () => {
      expect(await findUserById(f.customerB, f.orgA)).toBeNull();
      expect(await findUserById(f.customerA, f.orgB)).toBeNull();
    });

    it("returns the user under their own organization", async () => {
      const user = await findUserById(f.customerA, f.orgA);
      expect(user?.id).toBe(f.customerA);
      expect(user?.organizationId).toBe(f.orgA);
    });

    it("never includes another organization's users in a listing", async () => {
      const listed = await listUsers(f.orgA, {});
      const ids = listed.map((u) => u.id);

      expect(ids).toContain(f.customerA);
      expect(ids).not.toContain(f.customerB);
      expect(ids).not.toContain(f.adminB);
    });

    it("scopes listings for every organization independently", async () => {
      const inB = (await listUsers(f.orgB, {})).map((u) => u.id);

      expect(inB).toContain(f.customerB);
      expect(inB).not.toContain(f.customerA);
      expect(inB).not.toContain(f.ownerA);
    });
  });

  // -------------------------------------------------------------------------
  // Rank rules, against real fixture identities
  // -------------------------------------------------------------------------

  describe("rank rules hold for real users", () => {
    const actor = (id: string, org: string, role: TenantActor["role"]): TenantActor => ({
      domain: "TENANT",
      userId: id,
      organizationId: org,
      role,
    });

    it("refuses an admin acting on a member in another organization", () => {
      expect(
        canActOn(actor(f.adminA, f.orgA, "ADMIN"), actor(f.customerB, f.orgB, "USER")),
      ).toEqual({ allowed: false, reason: "CROSS_ORGANIZATION" });
    });

    it("allows an admin acting on a member in their own organization", () => {
      expect(
        canActOn(actor(f.adminA, f.orgA, "ADMIN"), actor(f.customerA, f.orgA, "USER")),
      ).toEqual({ allowed: true });
    });

    it("refuses a member acting on anyone", () => {
      expect(
        canActOn(actor(f.customerA, f.orgA, "USER"), actor(f.adminA, f.orgA, "ADMIN")),
      ).toMatchObject({ allowed: false });
      expect(
        canActOn(actor(f.customerA, f.orgA, "USER"), actor(f.customerB, f.orgB, "USER")),
      ).toMatchObject({ allowed: false, reason: "CROSS_ORGANIZATION" });
    });

    it("never grants SUPER_ADMIN to a tenant actor", () => {
      expect(
        canAssignRole(actor(f.ownerA, f.orgA, "ADMIN"), "SUPER_ADMIN"),
      ).toEqual({ allowed: false, reason: "UNGRANTABLE_ROLE" });
    });
  });
});
