import {beforeEach, expect, it} from "vitest";

import { resolveMemberAccess } from "@/server/authorization/member-access";
import type { TenantActor } from "@/server/authorization/roles";
import { query } from "@/server/db/pool";
import { hasActiveAssignment, listCaseload } from "@/server/repositories/caseload";
import { createOrganization } from "@/server/repositories/organizations";
import { createUser } from "@/server/repositories/users";

import {describeIsolated, resetDatabase} from "./helpers/sql-db";

/**
 * ADR-013, proved: an ADMIN administers the whole organisation but reads only the health
 * data of members assigned to them.
 *
 * This is the guarantee that makes merging ORG_OWNER into ADMIN safe. If an ADMIN could
 * read every member, "an admin cannot read an unassigned member's health record" would be
 * an empty statement — and both the brief (§35.5) and the new brief (§19.5) require it.
 *
 * Covers SEC-03, SEC-04, SEC-05, RBAC-03, RBAC-04, RBAC-12 of the approved test plan.
 * SEC-03 is the case that matters most in the entire epic.
 */


interface Fixture {
  orgId: string;
  otherOrgId: string;
  legacyOwnerId: string;
  adminA: string;
  adminB: string;
  assignedToA: string;
  assignedToB: string;
  unassigned: string;
  foreignMember: string;
  foreignAdmin: string;
}

/**
 * Fixtures write the LEGACY labels, deliberately.
 *
 * Migration 006/007 have not run, so `tenant_role` still only accepts ORG_OWNER, ADMIN and
 * CUSTOMER. Writing what the database actually holds is what makes this suite a genuine
 * test of the compatibility layer rather than of a world that does not exist yet.
 */
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
    legacyOwnerId: await mk(org.id, "ORG_OWNER", "owner@studio.test"),
    adminA: await mk(org.id, "ADMIN", "admin.a@studio.test"),
    adminB: await mk(org.id, "ADMIN", "admin.b@studio.test"),
    assignedToA: await mk(org.id, "CUSTOMER", "anita@studio.test"),
    assignedToB: await mk(org.id, "CUSTOMER", "bhavna@studio.test"),
    unassigned: await mk(org.id, "CUSTOMER", "chandra@studio.test"),
    foreignMember: await mk(other.id, "CUSTOMER", "dev@other.test"),
    foreignAdmin: await mk(other.id, "ADMIN", "admin@other.test"),
  };

  await query(
    `INSERT INTO consultant_assignments (organization_id, consultant_id, customer_id)
     VALUES ($1, $2, $3), ($1, $4, $5)`,
    [f.orgId, f.adminA, f.assignedToA, f.adminB, f.assignedToB],
  );

  return f;
}

/** An admin as the session would present them after normalisation. */
const admin = (userId: string, organizationId: string): TenantActor => ({
  domain: "TENANT",
  userId,
  organizationId,
  role: "ADMIN",
});

/** A pre-migration ORG_OWNER: normalised to ADMIN, but carrying the legacy stored role. */
const legacyOwner = (userId: string, organizationId: string): TenantActor => ({
  domain: "TENANT",
  userId,
  organizationId,
  role: "ADMIN",
  storedRole: "ORG_OWNER",
});

const member = (userId: string, organizationId: string): TenantActor => ({
  domain: "TENANT",
  userId,
  organizationId,
  role: "USER",
});

describeIsolated("caseload scoping (ADR-013)", () => {
  let f: Fixture;

  beforeEach(async () => {
    await resetDatabase();
    f = await seed();
  });

  it("shows an ADMIN only their assigned members", async () => {
    const ids = (await listCaseload(admin(f.adminA, f.orgId))).map((c) => c.customerId);

    expect(ids).toEqual([f.assignedToA]);
    expect(ids).not.toContain(f.assignedToB);
    expect(ids).not.toContain(f.unassigned);
  });

  it("gives each ADMIN a different caseload", async () => {
    const a = (await listCaseload(admin(f.adminA, f.orgId))).map((c) => c.customerId);
    const b = (await listCaseload(admin(f.adminB, f.orgId))).map((c) => c.customerId);

    expect(a).toEqual([f.assignedToA]);
    expect(b).toEqual([f.assignedToB]);
  });

  /**
   * The merge's central risk, stated as a test.
   *
   * Before ADR-013 this list was org-wide for ORG_OWNER. The tempting implementation of
   * the merge was to make it org-wide for ADMIN. If that ever happens, this fails.
   */
  it("does NOT become organisation-wide just because the role is now ADMIN", async () => {
    const ids = (await listCaseload(admin(f.adminA, f.orgId))).map((c) => c.customerId);
    expect(ids).not.toContain(f.unassigned);
    expect(ids).toHaveLength(1);
  });

  // The transitional grandfather clause, until migration 007 seeds assignments.
  it("still shows a legacy ORG_OWNER every member of the organisation", async () => {
    const ids = (await listCaseload(legacyOwner(f.legacyOwnerId, f.orgId)))
      .map((c) => c.customerId)
      .sort();

    expect(ids).toEqual([f.assignedToA, f.assignedToB, f.unassigned].sort());
  });

  it("never includes another organisation's member, even for a legacy owner", async () => {
    const ids = (await listCaseload(legacyOwner(f.legacyOwnerId, f.orgId))).map(
      (c) => c.customerId,
    );
    expect(ids).not.toContain(f.foreignMember);
  });

  it("never lists staff as members", async () => {
    const ids = (await listCaseload(legacyOwner(f.legacyOwnerId, f.orgId))).map(
      (c) => c.customerId,
    );
    expect(ids).not.toContain(f.adminA);
    expect(ids).not.toContain(f.legacyOwnerId);
  });

  // RBAC-12 — an ended assignment is history, not a standing grant.
  it("drops a member once the assignment ends", async () => {
    await query(
      `UPDATE consultant_assignments SET ended_at = now()
        WHERE organization_id = $1 AND consultant_id = $2`,
      [f.orgId, f.adminA],
    );

    expect(await listCaseload(admin(f.adminA, f.orgId))).toEqual([]);
    expect(await hasActiveAssignment(f.orgId, f.adminA, f.assignedToA)).toBe(false);
  });
});

describeIsolated("resolveMemberAccess — the member-data gate", () => {
  let f: Fixture;

  beforeEach(async () => {
    await resetDatabase();
    f = await seed();
  });

  // SEC-04
  it("allows an ADMIN to read their assigned member", async () => {
    const { decision } = await resolveMemberAccess(admin(f.adminA, f.orgId), f.assignedToA);
    expect(decision).toEqual({ allowed: true });
  });

  /**
   * SEC-03 — THE case. An admin administering the organisation is not thereby entitled to
   * read a member's health record.
   */
  it("REFUSES an ADMIN reading a member assigned to someone else", async () => {
    const { decision } = await resolveMemberAccess(admin(f.adminA, f.orgId), f.assignedToB);
    expect(decision).toEqual({ allowed: false, reason: "NOT_ASSIGNED" });
  });

  it("REFUSES an ADMIN reading a member assigned to nobody", async () => {
    const { decision } = await resolveMemberAccess(admin(f.adminA, f.orgId), f.unassigned);
    expect(decision).toEqual({ allowed: false, reason: "NOT_ASSIGNED" });
  });

  // SEC-05 — organisation boundary is checked before the assignment lookup.
  it("REFUSES across organisations", async () => {
    const { decision } = await resolveMemberAccess(
      admin(f.adminA, f.orgId),
      f.foreignMember,
    );
    expect(decision).toMatchObject({ allowed: false });
  });

  it("REFUSES a foreign admin reaching into this organisation", async () => {
    const { decision } = await resolveMemberAccess(
      admin(f.foreignAdmin, f.otherOrgId),
      f.assignedToA,
    );
    expect(decision).toMatchObject({ allowed: false });
  });

  // SEC-09 / SEC-10
  it("lets a member read themselves and refuses another member", async () => {
    const self = await resolveMemberAccess(member(f.assignedToA, f.orgId), f.assignedToA);
    expect(self.decision).toEqual({ allowed: true });

    const other = await resolveMemberAccess(member(f.assignedToA, f.orgId), f.assignedToB);
    expect(other.decision).toEqual({ allowed: false, reason: "NOT_ASSIGNED" });
  });

  it("grandfathers a legacy ORG_OWNER onto any member of their organisation", async () => {
    const { decision } = await resolveMemberAccess(
      legacyOwner(f.legacyOwnerId, f.orgId),
      f.unassigned,
    );
    expect(decision).toEqual({ allowed: true });
  });

  it("does not grandfather a legacy owner across organisations", async () => {
    const { decision } = await resolveMemberAccess(
      legacyOwner(f.legacyOwnerId, f.orgId),
      f.foreignMember,
    );
    expect(decision).toMatchObject({ allowed: false });
  });

  /**
   * A denial for a specific member must be distinguishable from "this member has no data".
   * `memberExists` is what lets a route choose 403 over a misleading empty page.
   */
  it("reports that an unassigned member does exist, so a denial is not shown as empty", async () => {
    const { decision, memberExists } = await resolveMemberAccess(
      admin(f.adminA, f.orgId),
      f.unassigned,
    );
    expect(decision.allowed).toBe(false);
    expect(memberExists).toBe(true);
  });

  it("revoking an assignment immediately withdraws access", async () => {
    expect(
      (await resolveMemberAccess(admin(f.adminA, f.orgId), f.assignedToA)).decision,
    ).toEqual({ allowed: true });

    await query(
      `UPDATE consultant_assignments SET ended_at = now()
        WHERE organization_id = $1 AND consultant_id = $2 AND customer_id = $3`,
      [f.orgId, f.adminA, f.assignedToA],
    );

    expect(
      (await resolveMemberAccess(admin(f.adminA, f.orgId), f.assignedToA)).decision,
    ).toEqual({ allowed: false, reason: "NOT_ASSIGNED" });
  });
});
