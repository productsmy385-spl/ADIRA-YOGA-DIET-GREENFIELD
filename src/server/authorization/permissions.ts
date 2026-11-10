import {
  carriesCaseload,
  isLegacyOrganizationOwner,
  isTenantActor,
  rankOf,
  type Actor,
  type TenantRole,
} from "./roles";
import { roleHasPermission, type Permission } from "./permission-matrix";

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
  | "NOT_ASSIGNED"
  /** ADR-016: the role may see this member, but not this kind of data (a dietitian and yoga). */
  | "DOMAIN_RESTRICTED";

export type Decision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: DenialReason };

const ALLOW: Decision = { allowed: true };

/**
 * The one place a tenant permission is checked against the matrix (ADR-016). Platform
 * actors hold no tenant permissions at all (ADR-001).
 */
export function hasPermission(actor: Actor, permission: Permission): Decision {
  if (!isTenantActor(actor)) return deny("CROSS_DOMAIN");
  return roleHasPermission(actor.role, permission) ? ALLOW : deny("INSUFFICIENT_RANK");
}
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
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THIS FUNCTION IS HALF A GATE. NEVER USE IT ALONE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * It is a pure rank comparison, so it answers only "does this actor outrank this role".
 * Read in isolation it looks alarmingly permissive: a TRAINER (15) strictly outranks
 * STAFF (12) and USER (10), so this returns ALLOW for both.
 *
 * A trainer cannot create anybody, and the reason is the COMPOSITION every caller
 * performs — `canManageOrganization` FIRST, which is ADMIN-only:
 *
 *     if (!canManageOrganization(actor).allowed) return;   // a TRAINER stops here
 *     if (!canAssignRole(actor, role).allowed) return;     // never reached
 *
 * Both call sites do this — `addMemberAction` and `api/members/import` — and a new one
 * MUST. Calling this function on its own would grant account creation to every role that
 * happens to outrank the one being granted, which is not what any of them are for.
 *
 * `tests/role-acceptance.test.ts` asserts the composition rather than this function, and
 * says why at length; the first draft asserted this in isolation and failed.
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
  /*
   * `settings.update`, which the matrix grants to ADMIN alone — a permission, not a rank
   * threshold, so a future role placed above 20 is not admitted by accident (ADR-016).
   */
  return hasPermission(actor, "settings.update");
}

/**
 * May this actor administer the MEMBER ROSTER — add, import, export, change status,
 * review access requests, take people into a caseload (`members.*`)?
 *
 * ADMIN and TEAM_MANAGER (ADR-016). The roster is administration, not health data: this
 * grants no reach into anyone's practice, which stays `canAccessMemberData`.
 */
export function canManageMembers(actor: Actor): Decision {
  return hasPermission(actor, "members.create");
}

/** May this actor see and manage the TEAM and its workload (`team.*`)? ADMIN, TEAM_MANAGER. */
export function canManageTeam(actor: Actor): Decision {
  return hasPermission(actor, "team.view");
}

/**
 * May this actor edit, publish and unpublish the organization's PUBLIC WEBSITE
 * (`website.view/edit/publish/manage_templates`, WEBSITE-BUILDER-PRD NFR-SEC-WEB-004)?
 *
 * ADMIN only, for now. A public website speaks for the whole organization, which is
 * administration, not caseload work — so TRAINER and STAFF are excluded exactly as for
 * `canManageOrganization`. Stage 4's permission matrix decides whether TEAM_MANAGER gets
 * it; until then it is not granted by default. Reads no member data.
 */
export function canManageWebsite(actor: Actor): Decision {
  return hasPermission(actor, "website.edit");
}

/**
 * May this actor author the organization's LIBRARY and PROGRAMME TEMPLATES — yoga
 * exercises, meals, programmes, and their publish state?
 *
 * ADMIN and TRAINER. This is the clinical half of the old admin role: building the plans
 * an organization offers is what a trainer is for, and gating it on
 * `canManageOrganization` would have meant a trainer could be handed a caseload and then
 * be unable to write anything for it.
 *
 * STAFF is excluded deliberately. A published programme is what generates a member's
 * schedule, and authoring one is a clinical judgement rather than an operational task.
 *
 * NOTE WHAT THIS IS NOT. Library content belongs to the organization and names nobody, so
 * this permission involves no assignment and reads no member data. Handing a plan TO a
 * person is `canPrescribe` plus `canAccessMemberData`, which are separate questions asked
 * at the point the member is known.
 */
export type PracticeDomain = "yoga" | "diet";

export function canManageProgrammes(actor: Actor, domain: PracticeDomain): Decision {
  // ADR-016: per domain, so a DIETITIAN authors diet and is refused yoga.
  return hasPermission(actor, domain === "yoga" ? "yoga.create" : "diet.create");
}

/**
 * May this actor PRESCRIBE — assign a programme to a member, or change that assignment's
 * state?
 *
 * ADMIN and TRAINER, and this is only half the gate. Prescribing writes into somebody's
 * health record and generates their schedule, so the call site must ALSO establish
 * `canAccessMemberData` for the member in question. Neither check substitutes for the
 * other: this one says "your role prescribes", the other says "for this person".
 *
 * STAFF may watch a caseload and may message the people on it, and may not decide what
 * they practise.
 */
export function canPrescribe(actor: Actor, domain: PracticeDomain): Decision {
  return hasPermission(actor, domain === "yoga" ? "yoga.assign" : "diet.assign");
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
/**
 * Which kind of member data is being reached for (ADR-016).
 *   profile  name, contact, status — what any assigned practitioner needs to recognise them
 *   diet     diet plans and diet activities
 *   all      everything else: yoga, check-ins, progress, reports
 */
export type MemberDataDomain = "profile" | "diet" | "all";

export function canAccessMemberData(
  actor: Actor,
  member: MemberRef,
  hasActiveAssignment: boolean,
  domain: MemberDataDomain = "all",
): Decision {
  if (!isTenantActor(actor)) return deny("CROSS_DOMAIN");
  if (actor.organizationId !== member.organizationId) return deny("CROSS_ORGANIZATION");

  if (actor.userId === member.userId) return ALLOW;

  /*
   * A role that cannot hold a caseload can never be authorised by one.
   *
   * `carriesCaseload` covers ADMIN, TRAINER and STAFF — and covering them changes
   * nothing about the strength of this gate, because membership only buys the right to
   * be asked the next question. All three still need an active assignment, and a USER
   * still reaches nobody but themselves.
   *
   * Written as a named predicate rather than `actor.role !== "USER"`: the two happen to
   * agree today, and they are different claims. Inverting a USER check would silently
   * grant any future role the moment it was added.
   */
  if (!carriesCaseload(actor.role)) return deny("NOT_ASSIGNED");

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

  if (!hasActiveAssignment) return deny("NOT_ASSIGNED");

  /*
   * ADR-016: an assignment admits a DIETITIAN to the member's profile and DIET data only.
   * Checked after the assignment, so an unassigned dietitian still sees NOT_ASSIGNED.
   */
  if (actor.role === "DIETITIAN" && domain === "all") return deny("DOMAIN_RESTRICTED");

  return ALLOW;
}
