import { beforeEach, expect, it } from "vitest";

import { resolveMemberAccess } from "@/server/authorization/member-access";
import type { TenantActor } from "@/server/authorization/roles";
import { listCaseload } from "@/server/repositories/caseload";
import { createAssignment, listMembers } from "@/server/repositories/members";
import { createOrganization } from "@/server/repositories/organizations";
import { createUser } from "@/server/repositories/users";

import { describeIsolated, resetDatabase } from "./helpers/sql-db";

/**
 * TRAINER and STAFF against a real database.
 *
 * `role-matrix.test.ts` proves the pure rules exhaustively and without a database. This
 * file proves the half that pure functions cannot: that the QUERIES agree with them.
 *
 * That gap is where the dangerous bugs in this codebase have actually lived. `listCaseload`
 * matched `role = 'CUSTOMER'` alone for weeks after the role merge, and every unit test
 * passed the whole time — the predicate was in SQL, and no amount of testing
 * `canAccessMemberData` would ever have noticed. So the assertions below are deliberately
 * about rows returned, not decisions made:
 *
 *   · a TRAINER's caseload contains their assigned members and nobody else's
 *   · a STAFF caseload behaves identically, because the scoping is by assignment and not
 *     by role
 *   · neither can see a member of another organisation, even one assigned to somebody
 *   · both are refused a member in their own organisation without an assignment
 *   · the administrative roster lists trainers and staff, so they can be found and audited
 */

interface Fixture {
  orgA: string;
  orgB: string;
  adminA: string;
  trainerA: string;
  staffA: string;
  memberAssigned: string;
  memberUnassigned: string;
  trainerB: string;
  memberB: string;
}

async function seed(): Promise<Fixture> {
  const a = await createOrganization({ name: "Studio A", slug: "studio-a" });
  const b = await createOrganization({ name: "Studio B", slug: "studio-b" });

  const mk = async (
    organizationId: string,
    email: string,
    fullName: string,
    role: "ADMIN" | "TRAINER" | "STAFF" | "USER",
  ) =>
    (await createUser({ organizationId, email, fullName, role, status: "ACTIVE" })).id;

  const adminA = await mk(a.id, "admin@a.test", "Admin A", "ADMIN");
  const trainerA = await mk(a.id, "trainer@a.test", "Trainer A", "TRAINER");
  const staffA = await mk(a.id, "staff@a.test", "Staff A", "STAFF");
  const memberAssigned = await mk(a.id, "assigned@a.test", "Assigned", "USER");
  const memberUnassigned = await mk(a.id, "unassigned@a.test", "Unassigned", "USER");

  const trainerB = await mk(b.id, "trainer@b.test", "Trainer B", "TRAINER");
  const memberB = await mk(b.id, "member@b.test", "Member B", "USER");

  // Only the trainer and the staff member get the assigned member. The admin gets nobody,
  // which is the honest starting state and proves the caseload is not role-derived.
  await createAssignment(a.id, trainerA, memberAssigned);
  await createAssignment(a.id, staffA, memberAssigned);
  await createAssignment(b.id, trainerB, memberB);

  return {
    orgA: a.id,
    orgB: b.id,
    adminA,
    trainerA,
    staffA,
    memberAssigned,
    memberUnassigned,
    trainerB,
    memberB,
  };
}

function actor(
  userId: string,
  organizationId: string,
  role: TenantActor["role"],
): TenantActor {
  return { domain: "TENANT", userId, organizationId, role };
}

describeIsolated("TRAINER and STAFF isolation", () => {
  let f: Fixture;

  beforeEach(async () => {
    await resetDatabase();
    f = await seed();
  });

  /* ── caseload scoping, in SQL ─────────────────────────────────────────── */

  it("gives a trainer exactly the members assigned to them", async () => {
    const caseload = await listCaseload(actor(f.trainerA, f.orgA, "TRAINER"));

    expect(caseload.map((c) => c.customerId)).toEqual([f.memberAssigned]);
    expect(caseload.map((c) => c.customerId)).not.toContain(f.memberUnassigned);
  });

  it("gives a staff member the same treatment — scoped by assignment, not by role", async () => {
    const caseload = await listCaseload(actor(f.staffA, f.orgA, "STAFF"));
    expect(caseload.map((c) => c.customerId)).toEqual([f.memberAssigned]);
  });

  it("gives an admin with no assignments an empty caseload", async () => {
    // Being an ADMIN is permission to administer the organisation, never to read a
    // member's practice. An empty list here is the ADR-013 boundary working.
    const caseload = await listCaseload(actor(f.adminA, f.orgA, "ADMIN"));
    expect(caseload).toEqual([]);
  });

  it("never leaks another organisation's members into a caseload", async () => {
    for (const [userId, role] of [
      [f.trainerA, "TRAINER"],
      [f.staffA, "STAFF"],
      [f.adminA, "ADMIN"],
    ] as const) {
      const caseload = await listCaseload(actor(userId, f.orgA, role));
      expect(caseload.map((c) => c.customerId)).not.toContain(f.memberB);
    }
  });

  /* ── per-member access ────────────────────────────────────────────────── */

  it("refuses a trainer a member in their own organisation with no assignment", async () => {
    const { decision, memberExists } = await resolveMemberAccess(
      actor(f.trainerA, f.orgA, "TRAINER"),
      f.memberUnassigned,
    );

    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.reason).toBe("NOT_ASSIGNED");
    // In the organisation, so administration can still see the account exists.
    expect(memberExists).toBe(true);
  });

  it("refuses staff a member in their own organisation with no assignment", async () => {
    const { decision } = await resolveMemberAccess(
      actor(f.staffA, f.orgA, "STAFF"),
      f.memberUnassigned,
    );
    expect(decision.allowed).toBe(false);
  });

  it("allows a trainer their assigned member", async () => {
    const { decision } = await resolveMemberAccess(
      actor(f.trainerA, f.orgA, "TRAINER"),
      f.memberAssigned,
    );
    expect(decision.allowed).toBe(true);
  });

  it("reports a cross-organisation member as non-existent to every role", async () => {
    for (const [userId, role] of [
      [f.trainerA, "TRAINER"],
      [f.staffA, "STAFF"],
      [f.adminA, "ADMIN"],
    ] as const) {
      const { decision, memberExists } = await resolveMemberAccess(
        actor(userId, f.orgA, role),
        f.memberB,
      );

      expect(decision.allowed).toBe(false);
      // Not merely denied — indistinguishable from an id that does not exist, so this
      // cannot be used to enumerate another tenant's roll.
      expect(memberExists).toBe(false);
    }
  });

  it("refuses a trainer reaching into the organisation they do not belong to", async () => {
    // The actor claims org A while the member is in org B. `resolveMemberAccess` asks
    // membership scoped to the ACTOR's organisation, so this is refused without ever
    // consulting an assignment.
    const { decision } = await resolveMemberAccess(
      actor(f.trainerB, f.orgB, "TRAINER"),
      f.memberAssigned,
    );
    expect(decision.allowed).toBe(false);
  });

  /* ── administration can see the new roles ─────────────────────────────── */

  it("lists trainers and staff on the administrative roster", async () => {
    // A role the roster cannot list is a role nobody can find, suspend, or audit.
    const staff = await listMembers(f.orgA, { kind: "STAFF" });
    const roles = staff.map((s) => s.role).sort();

    expect(roles).toEqual(["ADMIN", "STAFF", "TRAINER"]);
    expect(staff.map((s) => s.id)).not.toContain(f.memberAssigned);
  });

  it("keeps trainers and staff out of the member roster", async () => {
    const members = await listMembers(f.orgA, { kind: "MEMBERS" });
    const ids = members.map((m) => m.id);

    expect(ids.sort()).toEqual([f.memberAssigned, f.memberUnassigned].sort());
    expect(ids).not.toContain(f.trainerA);
    expect(ids).not.toContain(f.staffA);
  });

  it("scopes the roster to one organisation", async () => {
    const members = await listMembers(f.orgA, { kind: "MEMBERS" });
    expect(members.map((m) => m.id)).not.toContain(f.memberB);
  });
});
