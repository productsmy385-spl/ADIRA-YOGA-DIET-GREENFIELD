import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TenantActor } from "./roles";

/**
 * The ORCHESTRATION between the pure rules and the database, tested without a database.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS SUITE EXISTS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `permissions.test.ts` covers the pure rules exhaustively, and `caseload-scope.test.ts`
 * covered `resolveMemberAccess` end to end — but that one needs an isolated database and
 * now skips. What was left uncovered is the part with the most room for error and the
 * worst consequence when it has one: the ORDER of the lookups, what is asked of the
 * database, and what is passed to the pure rule.
 *
 * That is not a hypothetical concern. The comment in `member-access.ts` records a real bug
 * of exactly this shape: the first version built the member reference from
 * `actor.organizationId`, so the pure rule was always told the member belonged to the
 * actor's own organization, the cross-organization branch could never fire, and a legacy
 * ORG_OWNER could read ANY member id from ANY tenant. Every pure-rule test still passed.
 *
 * The repositories are mocked, so the assertions are about WHAT WAS ASKED as much as what
 * was returned — including the queries that must NOT happen. "It refused without touching
 * the database" is a security property: a lookup that runs before the refusal is a timing
 * signal about another tenant's rows.
 */

const isMemberOfOrganization = vi.fn();
const hasActiveAssignment = vi.fn();
const recordAudit = vi.fn();

vi.mock("@/server/repositories/caseload", () => ({
  isMemberOfOrganization,
  hasActiveAssignment,
}));

vi.mock("@/server/repositories/audit-logs", () => ({ recordAudit }));

const { resolveMemberAccess, resolveMemberAccessAudited, actorFromSession } = await import(
  "./member-access"
);

const ORG = "org-1";
const OTHER_ORG = "org-2";

function admin(userId = "admin-1", organizationId = ORG): TenantActor {
  return { domain: "TENANT", userId, organizationId, role: "ADMIN" };
}

function member(userId = "member-1", organizationId = ORG): TenantActor {
  return { domain: "TENANT", userId, organizationId, role: "USER" };
}

/** A pre-merge owner: stored role still ORG_OWNER, normalised role ADMIN (ADR-013). */
function legacyOwner(userId = "owner-1", organizationId = ORG): TenantActor {
  return {
    domain: "TENANT",
    userId,
    organizationId,
    role: "ADMIN",
    storedRole: "ORG_OWNER",
  };
}

beforeEach(() => {
  isMemberOfOrganization.mockReset();
  hasActiveAssignment.mockReset();
  recordAudit.mockReset();
});

describe("reading yourself", () => {
  it("is allowed with no database lookup at all", async () => {
    const result = await resolveMemberAccess(member("me"), "me");

    expect(result).toEqual({ decision: { allowed: true }, memberExists: true });
    // Not an optimisation. A membership query here would be a pointless round trip on the
    // single hottest authorization path in the product — every customer, every page.
    expect(isMemberOfOrganization).not.toHaveBeenCalled();
    expect(hasActiveAssignment).not.toHaveBeenCalled();
  });
});

describe("the organization boundary", () => {
  it("asks whether the member belongs to the ACTOR's organization", async () => {
    isMemberOfOrganization.mockResolvedValue(true);
    hasActiveAssignment.mockResolvedValue(true);

    await resolveMemberAccess(admin("a", ORG), "member-9");

    // Scoped to the actor's own organization, deliberately: it answers "is this one of
    // mine", and a false tells us to refuse without disclosing whether the id exists
    // somewhere else.
    expect(isMemberOfOrganization).toHaveBeenCalledWith(ORG, "member-9");
  });

  it("refuses a member of another organization and reports it as non-existent", async () => {
    isMemberOfOrganization.mockResolvedValue(false);

    const result = await resolveMemberAccess(admin(), "foreign-member");

    expect(result.memberExists).toBe(false);
    expect(result.decision.allowed).toBe(false);
    // Never asks about assignments for a member that is not ours — that lookup would be
    // a timing signal about another tenant's rows.
    expect(hasActiveAssignment).not.toHaveBeenCalled();
  });

  it("refuses a LEGACY OWNER reaching into another organization", async () => {
    /*
     * THE REGRESSION TEST FOR THE RECORDED BUG.
     *
     * A legacy ORG_OWNER is allowed unconditionally within their own organization, so if
     * the member reference is built from the actor's organization rather than from the
     * membership check, this actor can read every member of every tenant. The pure rule
     * is not at fault and its tests do not fail — only this one does.
     */
    isMemberOfOrganization.mockResolvedValue(false);

    const result = await resolveMemberAccess(legacyOwner(), "member-in-org-2");

    expect(result.decision.allowed).toBe(false);
    expect(result.memberExists).toBe(false);
    expect(hasActiveAssignment).not.toHaveBeenCalled();
  });

  it("grandfathers a legacy owner only inside their own organization", async () => {
    isMemberOfOrganization.mockResolvedValue(true);

    const result = await resolveMemberAccess(legacyOwner(), "member-1");

    expect(result.decision.allowed).toBe(true);
    // No assignment needed: the grandfather clause is what makes a legacy owner
    // organization-wide, and asking would imply otherwise.
    expect(hasActiveAssignment).not.toHaveBeenCalled();
  });
});

describe("ADMIN is assignment-scoped (ADR-013)", () => {
  it("allows an admin with an active assignment", async () => {
    isMemberOfOrganization.mockResolvedValue(true);
    hasActiveAssignment.mockResolvedValue(true);

    const result = await resolveMemberAccess(admin("a"), "member-1");

    expect(result.decision.allowed).toBe(true);
    expect(hasActiveAssignment).toHaveBeenCalledWith(ORG, "a", "member-1");
  });

  it("refuses an admin with no assignment, even in their own organization", async () => {
    // The half of the merge that must NOT widen. Being an admin is permission to
    // administer the organization, never to read a member's health record.
    isMemberOfOrganization.mockResolvedValue(true);
    hasActiveAssignment.mockResolvedValue(false);

    const result = await resolveMemberAccess(admin(), "member-1");

    expect(result.decision.allowed).toBe(false);
    // Still reports existence, so the caller can answer 403 rather than an empty page —
    // a denial rendered as "no data" is indistinguishable from a probe that found nothing.
    expect(result.memberExists).toBe(true);
  });

  it("asks about the assignment only after membership is established", async () => {
    isMemberOfOrganization.mockResolvedValue(true);
    hasActiveAssignment.mockResolvedValue(false);

    await resolveMemberAccess(admin(), "member-1");

    expect(isMemberOfOrganization).toHaveBeenCalledTimes(1);
    expect(hasActiveAssignment).toHaveBeenCalledTimes(1);
  });
});

describe("a plain member", () => {
  it("cannot read another member, and no assignment lookup is attempted", async () => {
    isMemberOfOrganization.mockResolvedValue(true);

    const result = await resolveMemberAccess(member("me"), "someone-else");

    expect(result.decision.allowed).toBe(false);
    // An assignment could never help a USER, so querying for one would be a round trip
    // whose answer is discarded — and a code path that looks like it might matter.
    expect(hasActiveAssignment).not.toHaveBeenCalled();
  });
});

describe("auditing", () => {
  it("records a DENIED entry with the reason and the member reached for", async () => {
    isMemberOfOrganization.mockResolvedValue(true);
    hasActiveAssignment.mockResolvedValue(false);

    await resolveMemberAccessAudited(admin("a"), "member-1", "member.read");

    expect(recordAudit).toHaveBeenCalledTimes(1);
    const entry = recordAudit.mock.calls[0][0];
    expect(entry).toMatchObject({
      organizationId: ORG,
      actorDomain: "TENANT",
      actorId: "a",
      action: "member.read",
      resourceType: "member",
      resourceId: "member-1",
      outcome: "DENIED",
    });
    // The reason is what makes `audit_logs_denied_idx` worth having: a denial nobody can
    // categorise is a probe nobody can investigate.
    expect(entry.metadata).toMatchObject({ reason: "NOT_ASSIGNED", role: "ADMIN" });
  });

  it("does not audit an allowed read", async () => {
    // Every successful member read would otherwise write a row, and an audit table that
    // grows with ordinary traffic is one nobody can search when it matters.
    isMemberOfOrganization.mockResolvedValue(true);
    hasActiveAssignment.mockResolvedValue(true);

    await resolveMemberAccessAudited(admin(), "member-1", "member.read");

    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe("actorFromSession", () => {
  it("carries organization and role from the session, never from a parameter", async () => {
    // ADR-004 at its origin: this is the only place an actor is constructed, and every
    // field comes from the verified session.
    const actor = actorFromSession({
      sessionId: "s",
      userId: "u",
      organizationId: ORG,
      role: "ADMIN",
      email: "a@example.com",
      fullName: "A",
      locale: "en",
      issuedAt: new Date(),
      expiresAt: new Date(),
    } as Parameters<typeof actorFromSession>[0]);

    expect(actor).toEqual({
      domain: "TENANT",
      userId: "u",
      organizationId: ORG,
      role: "ADMIN",
    });
  });

  it("preserves storedRole when the session carries one", async () => {
    // The grandfather clause reads it, and the session is the only place it can be
    // trusted — a request parameter could claim anything.
    const actor = actorFromSession({
      sessionId: "s",
      userId: "u",
      organizationId: OTHER_ORG,
      role: "ADMIN",
      storedRole: "ORG_OWNER",
      email: "a@example.com",
      fullName: "A",
      locale: "en",
      issuedAt: new Date(),
      expiresAt: new Date(),
    } as Parameters<typeof actorFromSession>[0]);

    expect(actor.storedRole).toBe("ORG_OWNER");
    expect(actor.organizationId).toBe(OTHER_ORG);
  });
});
