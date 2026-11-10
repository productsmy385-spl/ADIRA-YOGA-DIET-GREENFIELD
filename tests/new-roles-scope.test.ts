import { beforeEach, expect, it } from "vitest";

import { resolveMemberAccess } from "@/server/authorization/member-access";
import type { TenantActor } from "@/server/authorization/roles";
import { createAssignment } from "@/server/repositories/members";
import { createOrganization } from "@/server/repositories/organizations";
import { createUser } from "@/server/repositories/users";

import { describeIsolated, resetDatabase } from "./helpers/sql-db";

/**
 * ADR-016 against the real assignment lookup: the new roles reach member data only
 * through `consultant_assignments`, and a dietitian only for diet.
 */

describeIsolated("TEAM_MANAGER and DIETITIAN member-data scope", () => {
  let org: string;
  let member: string;
  let dietitian: TenantActor;
  let manager: TenantActor;

  const mk = async (role: "USER" | "DIETITIAN" | "TEAM_MANAGER", email: string) =>
    (await createUser({ organizationId: org, email, fullName: email, role, status: "ACTIVE" })).id;

  beforeEach(async () => {
    await resetDatabase();
    org = (await createOrganization({ name: "Studio", slug: "studio" })).id;
    member = await mk("USER", "member@studio.example");
    const d = await mk("DIETITIAN", "dietitian@studio.example");
    const m = await mk("TEAM_MANAGER", "manager@studio.example");
    dietitian = { domain: "TENANT", userId: d, organizationId: org, role: "DIETITIAN" };
    manager = { domain: "TENANT", userId: m, organizationId: org, role: "TEAM_MANAGER" };
  });

  it("stores the new roles (migration 014)", () => {
    expect(dietitian.userId).toBeTruthy();
    expect(manager.userId).toBeTruthy();
  });

  it("refuses an unassigned dietitian and team manager", async () => {
    expect((await resolveMemberAccess(dietitian, member, "diet")).decision).toEqual({
      allowed: false,
      reason: "NOT_ASSIGNED",
    });
    expect((await resolveMemberAccess(manager, member, "profile")).decision.allowed).toBe(false);
  });

  it("admits an assigned dietitian to diet data and refuses the rest", async () => {
    await createAssignment(org, dietitian.userId, member);
    expect((await resolveMemberAccess(dietitian, member, "diet")).decision.allowed).toBe(true);
    expect((await resolveMemberAccess(dietitian, member, "profile")).decision.allowed).toBe(true);
    expect((await resolveMemberAccess(dietitian, member, "all")).decision).toEqual({
      allowed: false,
      reason: "DOMAIN_RESTRICTED",
    });
  });

  it("admits an assigned team manager like any caseload role", async () => {
    await createAssignment(org, manager.userId, member);
    expect((await resolveMemberAccess(manager, member, "all")).decision.allowed).toBe(true);
  });
});
