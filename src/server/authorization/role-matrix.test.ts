import { describe, expect, it } from "vitest";

import {
  canAccessMemberData,
  canAssignRole,
  canManageOrganization,
  canManageProgrammes,
  canPrescribe,
} from "./permissions";
import {
  carriesCaseload,
  homePathForRole,
  rankOf,
  TENANT_ROLES,
  type Actor,
  type TenantRole,
} from "./roles";

/**
 * The complete four-role permission matrix, asserted exhaustively.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY EXHAUSTIVE RATHER THAN A FEW EXAMPLES
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * TRAINER and STAFF were added to a rank table that already existed, and the danger in
 * that shape of change is not the case you think about — it is the cell you never
 * enumerate. A test that checks "TRAINER cannot manage the organization" proves one cell;
 * it says nothing about whether STAFF accidentally can, or whether some later role
 * inherits a capability because a check was written as `rank >= ADMIN`.
 *
 * So every permission is asserted for every role, from a table that is itself checked for
 * completeness against `TENANT_ROLES`. Adding a role without deciding its row fails here
 * rather than shipping.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THESE ARE PURE FUNCTIONS AND THAT IS THE POINT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * No database, no session, no request. The rules can therefore be enumerated completely
 * and cheaply, which is exactly what a security boundary deserves. The DATABASE-backed
 * half — that a trainer's caseload query really is scoped, that a cross-tenant row really
 * is refused — lives in `tests/tenant-isolation.test.ts` and `tests/role-isolation.test.ts`
 * and is not duplicated here.
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";

function tenant(role: TenantRole, userId = "user-1", organizationId = ORG): Actor {
  return { domain: "TENANT", userId, organizationId, role };
}

const platform: Actor = {
  domain: "PLATFORM",
  accountId: "owner-1",
  role: "SUPER_ADMIN",
};

/** The intended matrix, written once, in the terms the product uses. */
const MATRIX: Record<
  TenantRole,
  {
    manageOrganization: boolean;
    manageProgrammes: boolean;
    prescribe: boolean;
    caseload: boolean;
    home: string;
  }
> = {
  ADMIN: {
    manageOrganization: true,
    manageProgrammes: true,
    prescribe: true,
    caseload: true,
    home: "/admin",
  },
  TRAINER: {
    manageOrganization: false,
    manageProgrammes: true,
    prescribe: true,
    caseload: true,
    home: "/trainer",
  },
  STAFF: {
    manageOrganization: false,
    manageProgrammes: false,
    prescribe: false,
    caseload: true,
    home: "/staff",
  },
  USER: {
    manageOrganization: false,
    manageProgrammes: false,
    prescribe: false,
    caseload: false,
    home: "/dashboard",
  },
};

describe("the role matrix is complete", () => {
  it("has a row for every tenant role", () => {
    // If a role is added to TENANT_ROLES without a row here, this fails — which is the
    // only reliable way to make "decide what it may do" a required step.
    expect(Object.keys(MATRIX).sort()).toEqual([...TENANT_ROLES].sort());
  });

  it("orders ranks ADMIN > TRAINER > STAFF > USER", () => {
    expect(rankOf("ADMIN")).toBeGreaterThan(rankOf("TRAINER"));
    expect(rankOf("TRAINER")).toBeGreaterThan(rankOf("STAFF"));
    expect(rankOf("STAFF")).toBeGreaterThan(rankOf("USER"));
  });
});

describe("capabilities, every role", () => {
  for (const role of TENANT_ROLES) {
    const expected = MATRIX[role];

    it(`${role}: organization administration = ${expected.manageOrganization}`, () => {
      expect(canManageOrganization(tenant(role)).allowed).toBe(
        expected.manageOrganization,
      );
    });

    it(`${role}: programme authoring = ${expected.manageProgrammes}`, () => {
      expect(canManageProgrammes(tenant(role)).allowed).toBe(expected.manageProgrammes);
    });

    it(`${role}: prescribing = ${expected.prescribe}`, () => {
      expect(canPrescribe(tenant(role)).allowed).toBe(expected.prescribe);
    });

    it(`${role}: can hold a caseload = ${expected.caseload}`, () => {
      expect(carriesCaseload(role)).toBe(expected.caseload);
    });

    it(`${role}: lands on ${expected.home}`, () => {
      expect(homePathForRole(role)).toBe(expected.home);
    });
  }
});

describe("a platform actor is refused every tenant capability", () => {
  // ADR-001: SUPER_ADMIN administers organizations, not the people inside them. It must
  // fall through no rank check into a tenant permission.
  it("cannot manage an organization, author programmes, or prescribe", () => {
    expect(canManageOrganization(platform).allowed).toBe(false);
    expect(canManageProgrammes(platform).allowed).toBe(false);
    expect(canPrescribe(platform).allowed).toBe(false);
  });

  it("cannot read member data even where an assignment exists", () => {
    expect(
      canAccessMemberData(platform, { userId: "member-1", organizationId: ORG }, true)
        .allowed,
    ).toBe(false);
  });
});

describe("role escalation", () => {
  /**
   * The grant matrix, derived entirely from strict rank.
   *
   * Every REFUSED cell below is refused because `canAssignRole` demands the actor
   * strictly outrank the role — not because of a special case. That is worth asserting
   * precisely because it looks like it needs special cases: "ADMIN cannot create ADMIN"
   * reads like a rule somebody wrote, and it is a consequence.
   */
  const cases: Array<[TenantRole, TenantRole, boolean]> = [
    ["ADMIN", "USER", true],
    ["ADMIN", "STAFF", true],
    ["ADMIN", "TRAINER", true],
    ["ADMIN", "ADMIN", false],

    ["TRAINER", "USER", true],
    ["TRAINER", "STAFF", true],
    ["TRAINER", "TRAINER", false],
    ["TRAINER", "ADMIN", false],

    ["STAFF", "USER", true],
    ["STAFF", "STAFF", false],
    ["STAFF", "TRAINER", false],
    ["STAFF", "ADMIN", false],

    ["USER", "USER", false],
    ["USER", "STAFF", false],
    ["USER", "TRAINER", false],
    ["USER", "ADMIN", false],
  ];

  for (const [actorRole, granted, allowed] of cases) {
    it(`${actorRole} → ${granted} is ${allowed ? "permitted" : "REFUSED"}`, () => {
      expect(canAssignRole(tenant(actorRole), granted).allowed).toBe(allowed);
    });
  }

  it("refuses SUPER_ADMIN to every tenant role, at every rank", () => {
    // Not merely senior — a different identity domain and a different table. There is no
    // ladder connecting the two, so there is no rung to climb.
    for (const role of TENANT_ROLES) {
      const decision = canAssignRole(tenant(role), "SUPER_ADMIN");
      expect(decision.allowed).toBe(false);
      expect(decision.allowed === false && decision.reason).toBe("UNGRANTABLE_ROLE");
    }
  });

  it("refuses a tenant role to a platform actor too", () => {
    for (const role of TENANT_ROLES) {
      expect(canAssignRole(platform, role).allowed).toBe(false);
    }
  });
});

describe("member data stays assignment-scoped for every caseload role", () => {
  const member = { userId: "member-1", organizationId: ORG };

  for (const role of ["ADMIN", "TRAINER", "STAFF"] as TenantRole[]) {
    it(`${role} is refused without an assignment`, () => {
      const decision = canAccessMemberData(tenant(role), member, false);
      expect(decision.allowed).toBe(false);
      expect(decision.allowed === false && decision.reason).toBe("NOT_ASSIGNED");
    });

    it(`${role} is allowed with an assignment`, () => {
      expect(canAccessMemberData(tenant(role), member, true).allowed).toBe(true);
    });

    it(`${role} is refused across organizations even WITH an assignment`, () => {
      // The cross-organization branch must be reached before the assignment is consulted;
      // an assignment that spans tenants should be impossible, and if one ever existed it
      // must not be honoured.
      const decision = canAccessMemberData(
        tenant(role, "actor-1", OTHER_ORG),
        member,
        true,
      );
      expect(decision.allowed).toBe(false);
      expect(decision.allowed === false && decision.reason).toBe("CROSS_ORGANIZATION");
    });
  }

  it("a USER reaches themselves and nobody else, assignment or not", () => {
    const self = tenant("USER", "member-1");
    expect(canAccessMemberData(self, member, false).allowed).toBe(true);

    const other = tenant("USER", "member-2");
    expect(canAccessMemberData(other, member, true).allowed).toBe(false);
  });
});
