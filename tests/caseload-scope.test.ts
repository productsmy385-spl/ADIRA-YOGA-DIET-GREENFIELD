import { beforeEach, describe, expect, it } from "vitest";

import { query } from "@/server/db/pool";
import { canViewCustomer, listCaseload } from "@/server/repositories/caseload";
import { createOrganization } from "@/server/repositories/organizations";
import { createUser } from "@/server/repositories/users";

import { hasTestDatabase, resetDatabase } from "./helpers/sql-db";

/**
 * ADR-002, proved: `ADMIN` is assignment-scoped, not organisation-wide.
 *
 * This is the guarantee that makes the combined admin/consultant role safe. If an ADMIN
 * could see every customer, "a consultant cannot read an unassigned customer's health
 * record" would be an empty statement — and the brief requires it as a test (§35).
 */

const describeWithDatabase = hasTestDatabase ? describe : describe.skip;

interface Fixture {
  orgId: string;
  otherOrgId: string;
  ownerId: string;
  adminA: string;
  adminB: string;
  assignedToA: string;
  assignedToB: string;
  unassigned: string;
  foreignCustomer: string;
}

async function seed(): Promise<Fixture> {
  const org = await createOrganization({ name: "Studio", slug: "studio" });
  const other = await createOrganization({ name: "Other", slug: "other" });

  const mk = async (
    orgId: string,
    role: "ORG_OWNER" | "ADMIN" | "CUSTOMER",
    email: string,
  ) =>
    (
      await createUser({
        organizationId: orgId,
        email,
        fullName: email.split("@")[0],
        role,
        status: "ACTIVE",
      })
    ).id;

  const f: Fixture = {
    orgId: org.id,
    otherOrgId: other.id,
    ownerId: await mk(org.id, "ORG_OWNER", "owner@studio.test"),
    adminA: await mk(org.id, "ADMIN", "admin.a@studio.test"),
    adminB: await mk(org.id, "ADMIN", "admin.b@studio.test"),
    assignedToA: await mk(org.id, "CUSTOMER", "anita@studio.test"),
    assignedToB: await mk(org.id, "CUSTOMER", "bhavna@studio.test"),
    unassigned: await mk(org.id, "CUSTOMER", "chandra@studio.test"),
    foreignCustomer: await mk(other.id, "CUSTOMER", "dev@other.test"),
  };

  await query(
    `INSERT INTO consultant_assignments (organization_id, consultant_id, customer_id)
     VALUES ($1, $2, $3), ($1, $4, $5)`,
    [f.orgId, f.adminA, f.assignedToA, f.adminB, f.assignedToB],
  );

  return f;
}

describeWithDatabase("caseload scoping (ADR-002)", () => {
  let f: Fixture;

  beforeEach(async () => {
    await resetDatabase();
    f = await seed();
  });

  it("shows an ADMIN only their assigned customers", async () => {
    const caseload = await listCaseload(f.orgId, "ADMIN", f.adminA);
    const ids = caseload.map((c) => c.customerId);

    expect(ids).toEqual([f.assignedToA]);
    expect(ids).not.toContain(f.assignedToB);
    expect(ids).not.toContain(f.unassigned);
  });

  it("gives each ADMIN a different caseload", async () => {
    const a = await listCaseload(f.orgId, "ADMIN", f.adminA);
    const b = await listCaseload(f.orgId, "ADMIN", f.adminB);

    expect(a.map((c) => c.customerId)).toEqual([f.assignedToA]);
    expect(b.map((c) => c.customerId)).toEqual([f.assignedToB]);
  });

  it("shows an ORG_OWNER every customer in the organisation", async () => {
    const ids = (await listCaseload(f.orgId, "ORG_OWNER", f.ownerId))
      .map((c) => c.customerId)
      .sort();

    expect(ids).toEqual([f.assignedToA, f.assignedToB, f.unassigned].sort());
  });

  it("never includes another organisation's customer, even for an owner", async () => {
    const ids = (await listCaseload(f.orgId, "ORG_OWNER", f.ownerId)).map(
      (c) => c.customerId,
    );
    expect(ids).not.toContain(f.foreignCustomer);
  });

  it("never lists staff as customers", async () => {
    const ids = (await listCaseload(f.orgId, "ORG_OWNER", f.ownerId)).map(
      (c) => c.customerId,
    );
    expect(ids).not.toContain(f.adminA);
    expect(ids).not.toContain(f.ownerId);
  });

  // An ended assignment is history. A consultant who no longer serves someone must lose
  // access to their record, not keep it because the row still exists.
  it("drops a customer once the assignment ends", async () => {
    await query(
      `UPDATE consultant_assignments SET ended_at = now()
        WHERE organization_id = $1 AND consultant_id = $2`,
      [f.orgId, f.adminA],
    );

    expect(await listCaseload(f.orgId, "ADMIN", f.adminA)).toEqual([]);
    expect(await canViewCustomer(f.orgId, "ADMIN", f.adminA, f.assignedToA)).toBe(false);
  });
});

describeWithDatabase("canViewCustomer", () => {
  let f: Fixture;

  beforeEach(async () => {
    await resetDatabase();
    f = await seed();
  });

  it("allows an ADMIN to open their own assigned customer", async () => {
    expect(await canViewCustomer(f.orgId, "ADMIN", f.adminA, f.assignedToA)).toBe(true);
  });

  /** The §35 requirement, stated as a test. */
  it("refuses an ADMIN opening a customer assigned to someone else", async () => {
    expect(await canViewCustomer(f.orgId, "ADMIN", f.adminA, f.assignedToB)).toBe(false);
  });

  it("refuses an ADMIN opening an unassigned customer", async () => {
    expect(await canViewCustomer(f.orgId, "ADMIN", f.adminA, f.unassigned)).toBe(false);
  });

  it("allows an ORG_OWNER to open any customer in their organisation", async () => {
    expect(await canViewCustomer(f.orgId, "ORG_OWNER", f.ownerId, f.unassigned)).toBe(true);
    expect(await canViewCustomer(f.orgId, "ORG_OWNER", f.ownerId, f.assignedToB)).toBe(true);
  });

  it("refuses an ORG_OWNER reaching into another organisation", async () => {
    expect(
      await canViewCustomer(f.orgId, "ORG_OWNER", f.ownerId, f.foreignCustomer),
    ).toBe(false);
  });

  // A customer has no consultant reach at all — they are not staff.
  it("refuses a CUSTOMER viewing anyone, including themselves through this path", async () => {
    expect(
      await canViewCustomer(f.orgId, "CUSTOMER", f.assignedToA, f.assignedToA),
    ).toBe(false);
    expect(
      await canViewCustomer(f.orgId, "CUSTOMER", f.assignedToA, f.assignedToB),
    ).toBe(false);
  });
});
