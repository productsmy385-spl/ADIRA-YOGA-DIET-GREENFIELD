import { describe, expect, it } from "vitest";

import {
  canAccessMemberData,
  canActOn,
  canAssignRole,
  canManageOrganization,
} from "./permissions";
import type { PlatformActor, StoredTenantRole, TenantActor, TenantRole } from "./roles";

/**
 * Authorization rules for the merged role model (ADR-013).
 *
 * The rule every case here defends:
 *
 *   Administrative reach is organization-wide. Member health and activity data access
 *   remains assignment-scoped.
 *
 * RBAC-01 … RBAC-12 of BMAD/07-testing-and-review/ROLE-MODEL-TEST-PLAN.md.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";

let seq = 0;
const uid = () => `user-${(seq += 1)}`;

function tenant(
  role: TenantRole,
  organizationId = ORG_A,
  overrides: { userId?: string; storedRole?: StoredTenantRole } = {},
): TenantActor {
  return {
    domain: "TENANT",
    userId: overrides.userId ?? uid(),
    organizationId,
    role,
    ...(overrides.storedRole ? { storedRole: overrides.storedRole } : {}),
  };
}

function platform(): PlatformActor {
  return { domain: "PLATFORM", accountId: uid(), role: "SUPER_ADMIN" };
}

const member = (userId: string, organizationId = ORG_A) => ({ userId, organizationId });

describe("canActOn", () => {
  // RBAC-08
  it("lets an ADMIN act on a USER in the same organization", () => {
    expect(canActOn(tenant("ADMIN"), tenant("USER"))).toEqual({ allowed: true });
  });

  /**
   * RBAC-07 — the rule that replaces "an owner outranks an admin".
   *
   * After the merge every admin is a peer, so none may administer another. ADR-013 keeps
   * strict rank rather than relaxing it: SUPER_ADMIN owns the ADMIN lifecycle. Relaxing
   * the comparison to `<` here would also let a USER act on a peer USER, which is the
   * invariant the strictness exists to protect.
   */
  it("refuses ADMIN acting on ADMIN — peers cannot administer each other", () => {
    expect(canActOn(tenant("ADMIN"), tenant("ADMIN"))).toEqual({
      allowed: false,
      reason: "INSUFFICIENT_RANK",
    });
  });

  it("refuses a USER acting on anyone, including a peer USER", () => {
    expect(canActOn(tenant("USER"), tenant("USER"))).toEqual({
      allowed: false,
      reason: "INSUFFICIENT_RANK",
    });
    expect(canActOn(tenant("USER"), tenant("ADMIN"))).toEqual({
      allowed: false,
      reason: "INSUFFICIENT_RANK",
    });
  });

  // RBAC-09 — checked before rank, so a cross-tenant probe never reveals rank information.
  it("refuses across organizations before comparing rank", () => {
    expect(canActOn(tenant("ADMIN", ORG_A), tenant("USER", ORG_B))).toEqual({
      allowed: false,
      reason: "CROSS_ORGANIZATION",
    });
  });

  it("refuses self-action", () => {
    const actor = tenant("ADMIN");
    expect(canActOn(actor, actor)).toEqual({ allowed: false, reason: "SELF_ACTION" });
  });

  // ADR-001: no code path grants a platform principal authority over a tenant user.
  it("refuses a platform actor acting on a tenant user", () => {
    expect(canActOn(platform(), tenant("USER"))).toEqual({
      allowed: false,
      reason: "CROSS_DOMAIN",
    });
  });
});

describe("canAssignRole", () => {
  it("lets an ADMIN grant USER", () => {
    expect(canAssignRole(tenant("ADMIN"), "USER")).toEqual({ allowed: true });
  });

  // RBAC-10 — admin provisioning belongs to SUPER_ADMIN (ADR-013 Q1).
  it("refuses an ADMIN granting ADMIN", () => {
    expect(canAssignRole(tenant("ADMIN"), "ADMIN")).toEqual({
      allowed: false,
      reason: "INSUFFICIENT_RANK",
    });
  });

  it("refuses a USER granting anything", () => {
    expect(canAssignRole(tenant("USER"), "USER")).toEqual({
      allowed: false,
      reason: "INSUFFICIENT_RANK",
    });
  });

  // RBAC-11 — a different identity domain, not a higher rung.
  it("refuses SUPER_ADMIN at any rank, from any actor", () => {
    for (const actor of [tenant("ADMIN"), tenant("USER"), platform()]) {
      expect(canAssignRole(actor, "SUPER_ADMIN")).toEqual({
        allowed: false,
        reason: "UNGRANTABLE_ROLE",
      });
    }
  });
});

describe("canManageOrganization", () => {
  // RBAC-02
  it("allows an ADMIN, organization-wide", () => {
    expect(canManageOrganization(tenant("ADMIN"))).toEqual({ allowed: true });
  });

  it("refuses a USER", () => {
    expect(canManageOrganization(tenant("USER"))).toEqual({
      allowed: false,
      reason: "INSUFFICIENT_RANK",
    });
  });

  /**
   * A platform account administers organizations, not the members inside them. Denying it
   * here is the decision, not an oversight — ADR-001 gives platform principals no implicit
   * tenant authority.
   */
  it("refuses a platform actor", () => {
    expect(canManageOrganization(platform())).toEqual({
      allowed: false,
      reason: "CROSS_DOMAIN",
    });
  });
});

describe("canAccessMemberData", () => {
  /**
   * RBAC-03 — THE case this epic exists to protect.
   *
   * An ADMIN administering the organization is not thereby entitled to read a member's
   * health record. If this ever returns allowed without an assignment, ADR-013 has been
   * implemented wrongly and the brief's §35.5 requirement is gone.
   */
  it("refuses an ADMIN with no assignment to the member", () => {
    const admin = tenant("ADMIN");
    expect(canAccessMemberData(admin, member(uid()), false)).toEqual({
      allowed: false,
      reason: "NOT_ASSIGNED",
    });
  });

  // RBAC-04
  it("allows an ADMIN with an active assignment", () => {
    const admin = tenant("ADMIN");
    expect(canAccessMemberData(admin, member(uid()), true)).toEqual({ allowed: true });
  });

  // RBAC-12 — an ended assignment is not an assignment; the caller passes false for one.
  it("refuses when the assignment is no longer active", () => {
    expect(canAccessMemberData(tenant("ADMIN"), member(uid()), false)).toEqual({
      allowed: false,
      reason: "NOT_ASSIGNED",
    });
  });

  // RBAC-05
  it("lets a USER read themselves", () => {
    const self = uid();
    const actor = tenant("USER", ORG_A, { userId: self });
    expect(canAccessMemberData(actor, member(self), false)).toEqual({ allowed: true });
  });

  it("refuses a USER reading another USER, even with an assignment flag set", () => {
    const actor = tenant("USER");
    // `true` here would be a caller bug; the rule must not depend on it for a USER.
    expect(canAccessMemberData(actor, member(uid()), true)).toEqual({
      allowed: false,
      reason: "NOT_ASSIGNED",
    });
  });

  it("refuses across organizations before considering assignment", () => {
    const admin = tenant("ADMIN", ORG_A);
    expect(canAccessMemberData(admin, member(uid(), ORG_B), true)).toEqual({
      allowed: false,
      reason: "CROSS_ORGANIZATION",
    });
  });

  /**
   * SEC-08 — a platform account gets no member data, ever, and not by having an
   * assignment either. There is no assignment table linking the two domains.
   */
  it("refuses a platform actor regardless of assignment", () => {
    expect(canAccessMemberData(platform(), member(uid()), true)).toEqual({
      allowed: false,
      reason: "CROSS_DOMAIN",
    });
  });

  /**
   * The transitional grandfather clause (ADR-013).
   *
   * A pre-migration ORG_OWNER keeps organization-wide data reach until migration 007 seeds
   * their assignments, because this code deploys first and stripping it would lock the only
   * real administrator out of their own organization between deployments.
   *
   * These two cases are deleted together with the clause in deployment 3.
   */
  it("grandfathers a legacy ORG_OWNER, and only via storedRole", () => {
    const legacy = tenant("ADMIN", ORG_A, { storedRole: "ORG_OWNER" });
    expect(canAccessMemberData(legacy, member(uid()), false)).toEqual({ allowed: true });
  });

  it("does not grandfather an ordinary migrated ADMIN", () => {
    const migrated = tenant("ADMIN", ORG_A, { storedRole: "ADMIN" });
    expect(canAccessMemberData(migrated, member(uid()), false)).toEqual({
      allowed: false,
      reason: "NOT_ASSIGNED",
    });
  });

  it("does not let the grandfather clause cross an organization boundary", () => {
    const legacy = tenant("ADMIN", ORG_A, { storedRole: "ORG_OWNER" });
    expect(canAccessMemberData(legacy, member(uid(), ORG_B), true)).toEqual({
      allowed: false,
      reason: "CROSS_ORGANIZATION",
    });
  });
});
