import { describe, expect, it } from "vitest";

import { canActOn, canAssignRole, hasOrganizationWideReach } from "./permissions";
import { TENANT_ROLES, type PlatformActor, type TenantActor, type TenantRole } from "./roles";

const ORG_A = "org-a";
const ORG_B = "org-b";

function tenant(role: TenantRole, orgId = ORG_A, userId = `${role}-in-${orgId}`): TenantActor {
  return { domain: "TENANT", userId, organizationId: orgId, role };
}

const platformOwner: PlatformActor = {
  domain: "PLATFORM",
  accountId: "platform-1",
  role: "PLATFORM_OWNER",
};

describe("canActOn", () => {
  it("lets a senior role act on a junior one in the same organization", () => {
    expect(canActOn(tenant("ORG_OWNER"), tenant("ADMIN"))).toEqual({ allowed: true });
    expect(canActOn(tenant("ORG_OWNER"), tenant("CUSTOMER"))).toEqual({ allowed: true });
    expect(canActOn(tenant("ADMIN"), tenant("CUSTOMER"))).toEqual({ allowed: true });
  });

  it("refuses a junior role acting upward", () => {
    expect(canActOn(tenant("CUSTOMER"), tenant("ADMIN"))).toEqual({
      allowed: false,
      reason: "INSUFFICIENT_RANK",
    });
    expect(canActOn(tenant("ADMIN"), tenant("ORG_OWNER"))).toEqual({
      allowed: false,
      reason: "INSUFFICIENT_RANK",
    });
  });

  // The rule is strict rank, not >=. This is the case that matters: one compromised
  // admin account must not be able to disable the organization's other admins.
  it.each(TENANT_ROLES)("refuses %s acting on a peer of the same role", (role) => {
    const actor = tenant(role, ORG_A, "actor");
    const peer = tenant(role, ORG_A, "peer");

    expect(canActOn(actor, peer)).toEqual({ allowed: false, reason: "INSUFFICIENT_RANK" });
  });

  it("refuses self-action even for the most senior role", () => {
    const owner = tenant("ORG_OWNER", ORG_A, "same-person");
    expect(canActOn(owner, owner)).toEqual({ allowed: false, reason: "SELF_ACTION" });
  });

  // Cross-tenant isolation. An ORG_OWNER outranks a CUSTOMER on every ladder, but not
  // one in somebody else's organization.
  it("refuses any cross-organization action regardless of rank", () => {
    expect(canActOn(tenant("ORG_OWNER", ORG_A), tenant("CUSTOMER", ORG_B))).toEqual({
      allowed: false,
      reason: "CROSS_ORGANIZATION",
    });
  });

  it("checks the organization before rank, so a cross-tenant probe is never reported as a rank problem", () => {
    const result = canActOn(tenant("CUSTOMER", ORG_A), tenant("ORG_OWNER", ORG_B));
    expect(result).toEqual({ allowed: false, reason: "CROSS_ORGANIZATION" });
  });

  // ADR-001: the two identity domains do not connect. A platform owner gets no implicit
  // authority over tenant users here, in either direction.
  it("refuses every combination that crosses the platform/tenant boundary", () => {
    expect(canActOn(platformOwner, tenant("CUSTOMER"))).toEqual({
      allowed: false,
      reason: "CROSS_DOMAIN",
    });
    expect(canActOn(tenant("ORG_OWNER"), platformOwner)).toEqual({
      allowed: false,
      reason: "CROSS_DOMAIN",
    });
    expect(canActOn(platformOwner, platformOwner)).toEqual({
      allowed: false,
      reason: "CROSS_DOMAIN",
    });
  });
});

describe("canAssignRole", () => {
  it("lets an actor grant strictly junior roles", () => {
    expect(canAssignRole(tenant("ORG_OWNER"), "ADMIN")).toEqual({ allowed: true });
    expect(canAssignRole(tenant("ORG_OWNER"), "CUSTOMER")).toEqual({ allowed: true });
    expect(canAssignRole(tenant("ADMIN"), "CUSTOMER")).toEqual({ allowed: true });
  });

  it.each(TENANT_ROLES)("refuses %s granting its own role", (role) => {
    expect(canAssignRole(tenant(role), role)).toEqual({
      allowed: false,
      reason: "INSUFFICIENT_RANK",
    });
  });

  // Ownership transfer is deliberately not reachable from the role dropdown.
  it("refuses an ORG_OWNER granting ORG_OWNER", () => {
    expect(canAssignRole(tenant("ORG_OWNER"), "ORG_OWNER")).toEqual({
      allowed: false,
      reason: "INSUFFICIENT_RANK",
    });
  });

  it("refuses an ADMIN granting ADMIN or above", () => {
    expect(canAssignRole(tenant("ADMIN"), "ADMIN")).toEqual({
      allowed: false,
      reason: "INSUFFICIENT_RANK",
    });
    expect(canAssignRole(tenant("ADMIN"), "ORG_OWNER")).toEqual({
      allowed: false,
      reason: "INSUFFICIENT_RANK",
    });
  });

  // PLATFORM_OWNER is refused before rank is even considered — it is not a senior rung,
  // it is a different ladder in a different table.
  it("never grants PLATFORM_OWNER through the tenant surface", () => {
    for (const role of TENANT_ROLES) {
      expect(canAssignRole(tenant(role), "PLATFORM_OWNER")).toEqual({
        allowed: false,
        reason: "UNGRANTABLE_ROLE",
      });
    }
    expect(canAssignRole(platformOwner, "PLATFORM_OWNER")).toEqual({
      allowed: false,
      reason: "UNGRANTABLE_ROLE",
    });
  });

  it("refuses a platform actor granting tenant roles through this surface", () => {
    expect(canAssignRole(platformOwner, "ADMIN")).toEqual({
      allowed: false,
      reason: "CROSS_DOMAIN",
    });
  });
});

describe("hasOrganizationWideReach", () => {
  // ADR-002: ADMIN is the combined admin/consultant role and is assignment-scoped.
  // If this ever returns true for ADMIN, every "admin cannot read an unassigned
  // customer" guarantee in the product silently evaporates.
  it("grants org-wide reach to ORG_OWNER only", () => {
    expect(hasOrganizationWideReach(tenant("ORG_OWNER"))).toBe(true);
    expect(hasOrganizationWideReach(tenant("ADMIN"))).toBe(false);
    expect(hasOrganizationWideReach(tenant("CUSTOMER"))).toBe(false);
  });
});
