import {
  isTenantActor,
  rankOf,
  type Actor,
  type TenantActor,
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
  | "UNGRANTABLE_ROLE";

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
 *  - An ORG_OWNER cannot grant ORG_OWNER. Strict rank forbids it, which means ownership
 *    transfer is not a dropdown on the users table. Handing over an organization is a
 *    deliberate, separately audited operation — not something reachable by mis-clicking
 *    a role select. TaskFlow HR made the same call for the same reason.
 *
 *  - PLATFORM_OWNER is not grantable through this surface at any rank. It is not merely
 *    senior to ORG_OWNER, it belongs to a different identity domain and a different
 *    table. There is no ladder connecting the two, so there is no rung to climb.
 */
export function canAssignRole(actor: Actor, role: TenantRole | "PLATFORM_OWNER"): Decision {
  if (role === "PLATFORM_OWNER") return deny("UNGRANTABLE_ROLE");
  if (!isTenantActor(actor)) return deny("CROSS_DOMAIN");
  if (rankOf(actor.role) <= rankOf(role)) return deny("INSUFFICIENT_RANK");
  return ALLOW;
}

/**
 * Does this tenant actor have organization-wide reach, or only their assigned customers?
 *
 * ADMIN is the combined admin/consultant role and is assignment-scoped (ADR-002). A
 * `false` here does not mean "denied" — it means the caller must additionally consult
 * `consultant_assignments` before returning any customer record.
 */
export function hasOrganizationWideReach(actor: TenantActor): boolean {
  return actor.role === "ORG_OWNER";
}
