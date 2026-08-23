import {
  isLegacyOrganizationOwner,
  isTenantActor,
  rankOf,
  type Actor,
  type TenantRole,
} from "./roles";

/**
 * The two rank rules that bound every act-on-another-account operation.
 *
 * A permission can express "this role manages users". It cannot express "this particular
 * admin may not disable the organization's owner", because that depends on *both*
 * parties. Rank is the rule that does, and it is deliberately kept as two pure functions
 * so it can be exhaustively tested without a database, a session, or a request.
 *
 * Both rules require the actor to *strictly* outrank the target. Strictly, not
 * greater-or-equal: peers acting on peers is precisely how one compromised admin account
 * locks the real ones out.
 *
 * This mirrors TaskFlow HR's `canActOn` / `canAssignRole`, which were written for the
 * same reason and whose reasoning is recorded in that project's DECISIONS.md.
 */

export type DenialReason =
  | "CROSS_DOMAIN"
  | "CROSS_ORGANIZATION"
  | "INSUFFICIENT_RANK"
  | "SELF_ACTION"
  | "UNGRANTABLE_ROLE"
  | "NOT_ASSIGNED";

export type Decision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: DenialReason };

const ALLOW: Decision = { allowed: true };
const deny = (reason: DenialReason): Decision => ({ allowed: false, reason });

/**
 * May `actor` administer `target` — disable, change role, reset credentials, remove?
 *
 * Returns a reason rather than a bare boolean so the caller can log *why* a privileged
 * action was refused. A denial with no reason is an unanswerable support ticket, and
 * CROSS_ORGANIZATION in particular is a signal worth alerting on: it means someone is
 * probing across a tenant boundary.
 *
 * Note what this function does NOT do: it never grants a PLATFORM_OWNER authority over a
 * tenant user. Platform-level intervention exists, but it is a separate, individually
 * audited operation — not a silent bypass reached by falling through a rank check.
 * "Owner must not automatically bypass authorization" is a requirement, and the way to
 * honour it is to give the bypass no code path here at all.
 */
export function canActOn(actor: Actor, target: Actor): Decision {
  if (!isTenantActor(actor) || !isTenantActor(target)) return deny("CROSS_DOMAIN");
  if (actor.organizationId !== target.organizationId) return deny("CROSS_ORGANIZATION");
  if (actor.userId === target.userId) return deny("SELF_ACTION");
  if (rankOf(actor.role) <= rankOf(target.role)) return deny("INSUFFICIENT_RANK");
  return ALLOW;
}

/**
 * May `actor` grant `role` to someone in their organization?
 *
 * Two consequences worth stating, because both look like bugs until you see the reason:
 *
 *  - An ADMIN cannot grant ADMIN. Strict rank forbids it, and after ADR-013 that is
 *    exactly right: provisioning an administrator is SUPER_ADMIN's job, not something
 *    reachable by mis-clicking a role select on the members table.
 *
 *  - SUPER_ADMIN is not grantable through this surface at any rank. It is not merely
 *    senior to ORG_OWNER, it belongs to a different identity domain and a different
 *    table. There is no ladder connecting the two, so there is no rung to climb.
 */
export function canAssignRole(actor: Actor, role: TenantRole | "SUPER_ADMIN"): Decision {
  if (role === "SUPER_ADMIN") return deny("UNGRANTABLE_ROLE");
  if (!isTenantActor(actor)) return deny("CROSS_DOMAIN");
  if (rankOf(actor.role) <= rankOf(role)) return deny("INSUFFICIENT_RANK");
  return ALLOW;
}

/**
 * May this actor perform ORGANIZATION-WIDE ADMINISTRATIVE operations?
 *
 * Administrative means: list the organization's members, create and suspend member
 * accounts, review access requests, manage organization settings and the join code,
 * and create or end assignments.
 *
 * It does NOT mean read anybody's health or activity data. That is
 * `canAccessMemberData`, and the two are separate functions precisely because the
 * previous single `hasOrganizationWideReach` let them be confused — merging ORG_OWNER
 * into ADMIN by flipping that one boolean would have handed every admin every member's
 * health record while nothing failed and no test broke (ADR-013).
 *
 * A SUPER_ADMIN is denied here, and that is deliberate rather than an oversight:
 * platform accounts administer organizations, not the members inside them, and ADR-001
 * gives them no implicit tenant authority. Platform-level intervention exists as a
 * separate, individually audited capability.
 */
export function canManageOrganization(actor: Actor): Decision {
  if (!isTenantActor(actor)) return deny("CROSS_DOMAIN");
  if (actor.role !== "ADMIN") return deny("INSUFFICIENT_RANK");
  return ALLOW;
}

/** The member whose health or activity data is being reached for. */
export interface MemberRef {
  readonly userId: string;
  readonly organizationId: string;
}

/**
 * May this actor read MEMBER-SENSITIVE data — activities, check-ins, progress, yoga and
 * diet plans, reports, appointments, consultation notes?
 *
 * This is the assignment boundary, and it is the security control the whole of ADR-013
 * exists to preserve. The rules, in the order they are checked:
 *
 *   1. A platform actor is denied outright. SUPER_ADMIN gets no automatic member data.
 *   2. Different organization → denied before anything else is considered.
 *   3. A USER may read themselves and nobody else.
 *   4. An ADMIN may read a member ONLY where an active assignment exists.
 *
 * `hasActiveAssignment` is passed in rather than looked up here so this stays a pure
 * function. The caller must source it from `consultant_assignments` with
 * `ended_at IS NULL` — an ended assignment is not an assignment.
 *
 * A denial must surface as 403 with an audit entry, never as an empty list. An empty
 * list is indistinguishable from "no data" and hides exactly the probing that
 * `audit_logs_denied_idx` exists to make visible.
 */
export function canAccessMemberData(
  actor: Actor,
  member: MemberRef,
  hasActiveAssignment: boolean,
): Decision {
  if (!isTenantActor(actor)) return deny("CROSS_DOMAIN");
  if (actor.organizationId !== member.organizationId) return deny("CROSS_ORGANIZATION");

  if (actor.userId === member.userId) return ALLOW;

  if (actor.role !== "ADMIN") return deny("NOT_ASSIGNED");

  /*
   * TRANSITIONAL — remove with ADR-013 deployment 3.
   *
   * A pre-migration ORG_OWNER already had organization-wide reach over member data. This
   * code ships BEFORE migration 007 seeds their assignments, so withdrawing that reach
   * here would leave the only real administrator in production unable to see a single
   * member of their own organization between two deployments.
   *
   * This grandfathers what they already had. It grants nothing new, applies to no account
   * created or migrated under ADR-013, and disappears the moment no row stores ORG_OWNER.
   */
  if (isLegacyOrganizationOwner(actor)) return ALLOW;

  return hasActiveAssignment ? ALLOW : deny("NOT_ASSIGNED");
}
