import { describe, expect, it } from "vitest";

import { PERMISSIONS, ROLE_PERMISSIONS, type Permission } from "./permission-matrix";
import { canAccessMemberData, canAssignRole, hasPermission } from "./permissions";
import { TENANT_ROLES, type Actor, type TenantRole } from "./roles";

/**
 * ADR-016. These tests pin the permission matrix row by row, so a change to production
 * authorization is a change to a test somebody has to read.
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const tenant = (role: TenantRole, userId = "actor"): Actor => ({
  domain: "TENANT",
  userId,
  organizationId: ORG,
  role,
});
const member = { userId: "member-1", organizationId: ORG };

const holds = (role: TenantRole, p: Permission) => ROLE_PERMISSIONS[role].has(p);

describe("permission matrix", () => {
  it("has a row for every tenant role and only known permissions", () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...TENANT_ROLES].sort());
    for (const role of TENANT_ROLES) {
      for (const p of ROLE_PERMISSIONS[role]) expect(PERMISSIONS).toContain(p);
    }
  });

  it("gives ADMIN everything and USER nothing", () => {
    expect(ROLE_PERMISSIONS.ADMIN.size).toBe(PERMISSIONS.length);
    expect(ROLE_PERMISSIONS.USER.size).toBe(0);
  });

  it("keeps settings and the website ADMIN-only", () => {
    for (const role of TENANT_ROLES.filter((r) => r !== "ADMIN")) {
      expect(holds(role, "settings.update")).toBe(false);
      expect(holds(role, "website.edit")).toBe(false);
      expect(holds(role, "website.publish")).toBe(false);
    }
  });

  it("lets TEAM_MANAGER run members and the team, but not author or prescribe", () => {
    for (const p of ["members.create", "members.assign", "team.invite", "team.assign_roles"] as const) {
      expect(holds("TEAM_MANAGER", p)).toBe(true);
    }
    for (const p of ["yoga.create", "yoga.assign", "diet.create", "diet.assign"] as const) {
      expect(holds("TEAM_MANAGER", p)).toBe(false);
    }
  });

  it("confines DIETITIAN to diet", () => {
    expect(holds("DIETITIAN", "diet.create")).toBe(true);
    expect(holds("DIETITIAN", "diet.assign")).toBe(true);
    for (const p of ["yoga.view", "yoga.create", "yoga.assign", "members.create", "team.view"] as const) {
      expect(holds("DIETITIAN", p)).toBe(false);
    }
  });

  it("gives a platform actor no tenant permission at all (ADR-001)", () => {
    const platform: Actor = { domain: "PLATFORM", accountId: "o", role: "SUPER_ADMIN" };
    for (const p of PERMISSIONS) expect(hasPermission(platform, p).allowed).toBe(false);
  });
});

describe("member data domains (ADR-016)", () => {
  it("admits an ASSIGNED dietitian to profile and diet, refuses everything else", () => {
    const d = tenant("DIETITIAN");
    expect(canAccessMemberData(d, member, true, "profile").allowed).toBe(true);
    expect(canAccessMemberData(d, member, true, "diet").allowed).toBe(true);
    expect(canAccessMemberData(d, member, true, "all")).toEqual({
      allowed: false,
      reason: "DOMAIN_RESTRICTED",
    });
  });

  it("still requires the assignment — an unassigned dietitian sees nothing", () => {
    expect(canAccessMemberData(tenant("DIETITIAN"), member, false, "diet")).toEqual({
      allowed: false,
      reason: "NOT_ASSIGNED",
    });
  });

  it("changes nothing for other roles", () => {
    for (const role of ["ADMIN", "TEAM_MANAGER", "TRAINER", "STAFF"] as const) {
      expect(canAccessMemberData(tenant(role), member, true, "all").allowed).toBe(true);
      expect(canAccessMemberData(tenant(role), member, false, "all").allowed).toBe(false);
    }
  });

  // Holding members.view is the roster, never a member's practice (ADR-013 invariant 3).
  it("gives TEAM_MANAGER no member data without an assignment", () => {
    expect(canAccessMemberData(tenant("TEAM_MANAGER"), member, false, "profile").allowed).toBe(false);
  });
});

describe("privilege escalation (strict rank)", () => {
  it("lets TEAM_MANAGER grant only roles below it", () => {
    const tm = tenant("TEAM_MANAGER");
    for (const r of ["TRAINER", "DIETITIAN", "STAFF", "USER"] as const) {
      expect(canAssignRole(tm, r).allowed).toBe(true);
    }
    expect(canAssignRole(tm, "TEAM_MANAGER").allowed).toBe(false);
    expect(canAssignRole(tm, "ADMIN").allowed).toBe(false);
    expect(canAssignRole(tm, "SUPER_ADMIN").allowed).toBe(false);
  });

  it("keeps TRAINER and DIETITIAN as peers who cannot grant each other", () => {
    expect(canAssignRole(tenant("TRAINER"), "DIETITIAN").allowed).toBe(false);
    expect(canAssignRole(tenant("DIETITIAN"), "TRAINER").allowed).toBe(false);
  });

  it("lets ADMIN grant TEAM_MANAGER but never ADMIN", () => {
    expect(canAssignRole(tenant("ADMIN"), "TEAM_MANAGER").allowed).toBe(true);
    expect(canAssignRole(tenant("ADMIN"), "ADMIN").allowed).toBe(false);
  });
});
