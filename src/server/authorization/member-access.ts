import { hasActiveAssignment, isMemberOfOrganization } from "@/server/repositories/caseload";
import { recordAudit } from "@/server/repositories/audit-logs";

import { canAccessMemberData, type Decision } from "./permissions";
import { carriesCaseload, type TenantActor } from "./roles";
import type { TenantSessionContext } from "@/server/repositories/sessions";

/**
 * The single gate for member-sensitive data.
 *
 * Every read of activities, check-ins, progress, yoga plans, diet plans, reports,
 * appointments, or consultation notes passes through here. One gate, so that adding a new
 * member-facing surface means calling a function that already exists rather than
 * reimplementing a scoping rule slightly differently.
 *
 * WHY THIS IS NOT A BOOLEAN
 *
 * It returns a `Decision` carrying a reason, and the reason is what the caller audits. A
 * bare `false` produces an unanswerable support ticket and, worse, tempts callers into
 * turning a denial into an empty list — at which point a cross-tenant probe is
 * indistinguishable from a member who simply has no data, and
 * `audit_logs_denied_idx` never sees it.
 *
 * WHAT A DENIAL MUST LOOK LIKE
 *
 * For a request naming a SPECIFIC member — `/admin/customers/<id>` — a denial is 403 (or
 * 404 where existence itself is sensitive), never an empty page. For a COLLECTION query,
 * the correct behaviour is different: return only the authorised rows, because "here are
 * the members you may see" is the honest answer to that question.
 */

/** Convert a verified session into the actor shape the pure rules take. */
export function actorFromSession(session: TenantSessionContext): TenantActor {
  return {
    domain: "TENANT",
    userId: session.userId,
    organizationId: session.organizationId,
    role: session.role,
    ...(session.storedRole ? { storedRole: session.storedRole } : {}),
  };
}

export interface MemberAccessResult {
  decision: Decision;
  /** False when the member does not exist in this organization at all. */
  memberExists: boolean;
}

/**
 * May this actor read the given member's sensitive data?
 *
 * Order matters. The assignment lookup runs only when the pure rules could be satisfied
 * by one — there is no point querying `consultant_assignments` for a USER reading
 * themselves, and no point at all for a cross-organization request, which must be refused
 * before any lookup reveals timing information about another tenant's rows.
 */
export async function resolveMemberAccess(
  actor: TenantActor,
  memberId: string,
): Promise<MemberAccessResult> {
  // Reading yourself needs no lookup and no assignment.
  if (actor.userId === memberId) {
    return { decision: { allowed: true }, memberExists: true };
  }

  /*
   * Establish that the member is in the ACTOR'S organization before anything else.
   *
   * This is load-bearing and was got wrong once. The first version built the member
   * reference from `actor.organizationId` and passed it straight to the pure rule — which
   * meant the rule was told, always, that the member belonged to the actor's own
   * organization. The cross-organization branch could therefore never fire, and a legacy
   * ORG_OWNER (who is allowed unconditionally within their own organization) could read
   * ANY member id from ANY tenant. A cross-tenant read, from an authorization function.
   *
   * The membership question is asked scoped to the actor's organization, deliberately. It
   * answers "is this one of mine", and a false tells us to refuse without disclosing
   * whether the id exists in some other tenant.
   */
  const inOrganization = await isMemberOfOrganization(actor.organizationId, memberId);

  if (!inOrganization) {
    return {
      decision: canAccessMemberData(
        actor,
        // A deliberately non-matching organization, so the pure rule reaches its
        // CROSS_ORGANIZATION branch rather than being told what we want to hear.
        { userId: memberId, organizationId: `${actor.organizationId}:foreign` },
        false,
      ),
      memberExists: false,
    };
  }

  const member = { userId: memberId, organizationId: actor.organizationId };

  // A USER reaching another member, or a platform actor, is refused with no lookup.
  const withoutAssignment = canAccessMemberData(actor, member, false);
  if (withoutAssignment.allowed) {
    return { decision: withoutAssignment, memberExists: true };
  }

  /*
   * DO NOT NARROW THIS TO A SINGLE ROLE.
   *
   * This short-circuit decides whether the assignment lookup happens at all, and it read
   * `actor.role !== "ADMIN"` — which was correct while ADMIN was the only role that could
   * hold a caseload, and became a silent denial the moment TRAINER and STAFF arrived.
   * `canAccessMemberData` was already right about them; this line returned before it was
   * ever asked with the real answer, so an assigned trainer was refused their own member
   * and every pure-function test still passed.
   *
   * `carriesCaseload` is the same predicate the permission uses, so the two cannot
   * disagree again. The skip is still worth keeping: querying
   * `consultant_assignments` for a role that can never hold one is a pointless round trip,
   * and for a cross-domain actor it would be a timing signal about another tenant's rows.
   */
  if (withoutAssignment.reason !== "NOT_ASSIGNED" || !carriesCaseload(actor.role)) {
    return { decision: withoutAssignment, memberExists: true };
  }

  const assigned = await hasActiveAssignment(actor.organizationId, actor.userId, memberId);

  return {
    decision: canAccessMemberData(actor, member, assigned),
    memberExists: true,
  };
}

/**
 * Resolve access and write a DENIED audit entry when refused.
 *
 * Auditing here rather than at each call site is the point: a denial that nobody records
 * is a probe nobody can investigate. `audit_logs_denied_idx` is a partial index over
 * exactly these rows, and it is worth nothing if the rows are not written.
 *
 * The audit entry names the member id being reached for. That is not a leak — the caller
 * already supplied it, and knowing *which* record someone tried to reach is the entire
 * value of the trail.
 */
export async function resolveMemberAccessAudited(
  actor: TenantActor,
  memberId: string,
  action: string,
): Promise<MemberAccessResult> {
  const result = await resolveMemberAccess(actor, memberId);

  if (!result.decision.allowed) {
    await recordAudit({
      organizationId: actor.organizationId,
      actorDomain: "TENANT",
      actorId: actor.userId,
      action,
      resourceType: "member",
      resourceId: memberId,
      outcome: "DENIED",
      metadata: { reason: result.decision.reason, role: actor.role },
    });
  }

  return result;
}

/** Thrown by `requireMemberAccess`. Carries the reason so a route can map it to a status. */
export class MemberAccessDenied extends Error {
  constructor(
    readonly reason: string,
    readonly memberExists: boolean,
  ) {
    super(`Access to member data denied: ${reason}`);
    this.name = "MemberAccessDenied";
  }
}

/**
 * Assert access, or throw.
 *
 * For use where the caller names a specific member and the only correct outcomes are
 * "proceed" or "refuse". It must not be used to filter a collection — see the note at the
 * top of this file about why a denial and an empty list are different answers.
 */
export async function requireMemberAccess(
  actor: TenantActor,
  memberId: string,
  action: string,
): Promise<void> {
  const { decision, memberExists } = await resolveMemberAccessAudited(actor, memberId, action);
  if (!decision.allowed) throw new MemberAccessDenied(decision.reason, memberExists);
}
