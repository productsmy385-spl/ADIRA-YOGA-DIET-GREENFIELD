import { actorFromSession } from "@/server/authorization/member-access";
import { canActOn, canAssignRole, canManageMembers, canManageTeam } from "@/server/authorization/permissions";
import { normaliseRole, type TenantActor, type TenantRole } from "@/server/authorization/roles";
import { recordAudit } from "@/server/repositories/audit-logs";
import { createAssignment, findMember, setMemberStatus } from "@/server/repositories/members";
import type { TenantSessionContext } from "@/server/repositories/sessions";
import { setUserRole, updateTeamProfile } from "@/server/repositories/users";

/**
 * Team management (brief §8, ADR-016) — the one entry point for team actions.
 *
 * EVERY action on a person requires BOTH:
 *   - the capability (`team.*` for profiles/roles/status, `members.assign` for caseloads), and
 *   - `canActOn`: same organisation, not yourself, and STRICTLY outranking them.
 * Changing a role additionally requires `canAssignRole` for the NEW role, so nobody can
 * promote anyone to their own level or above. A request cannot raise its own privilege:
 * the actor's role comes from the session, and acting on yourself is refused outright.
 *
 * Every change is audited with before/after values (brief §14). No secrets are involved.
 */

export type TeamResult = { ok: true; message: string } | { ok: false; message: string };

const TEAM_ROLES: readonly TenantRole[] = ["TEAM_MANAGER", "TRAINER", "DIETITIAN", "STAFF"];
const CASELOAD_TARGETS: readonly TenantRole[] = ["ADMIN", "TEAM_MANAGER", "TRAINER", "DIETITIAN", "STAFF"];

async function targetActor(session: TenantSessionContext, userId: string) {
  const member = await findMember(session.organizationId, userId);
  if (!member) return null;
  const actor: TenantActor = {
    domain: "TENANT",
    userId: member.id,
    organizationId: session.organizationId,
    role: normaliseRole(member.storedRole),
  };
  return { member, actor };
}

function audit(
  session: TenantSessionContext,
  action: string,
  resourceId: string,
  outcome: "SUCCESS" | "DENIED",
  metadata: Record<string, unknown>,
) {
  return recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action,
    resourceType: "user",
    resourceId,
    outcome,
    metadata,
  });
}

/** May the session act on this person at all? Audits a refusal. */
async function authorise(session: TenantSessionContext, userId: string, action: string) {
  const self = actorFromSession(session);
  if (!canManageTeam(self).allowed) {
    await audit(session, action, userId, "DENIED", { reason: "NO_TEAM_PERMISSION" });
    return null;
  }
  const target = await targetActor(session, userId);
  if (!target) return null;
  const decision = canActOn(self, target.actor);
  if (!decision.allowed) {
    await audit(session, action, userId, "DENIED", { reason: decision.reason });
    return null;
  }
  return target;
}

export async function changeTeamRole(
  session: TenantSessionContext,
  userId: string,
  newRole: string,
): Promise<TeamResult> {
  if (!TEAM_ROLES.includes(newRole as TenantRole)) return { ok: false, message: "Choose a team role." };
  const target = await authorise(session, userId, "team.role_change");
  if (!target) return { ok: false, message: "You cannot change this person's role." };

  const grant = canAssignRole(actorFromSession(session), newRole as TenantRole);
  if (!grant.allowed) {
    await audit(session, "team.role_change", userId, "DENIED", { reason: grant.reason, requested: newRole });
    return { ok: false, message: "You cannot grant that role." };
  }

  await setUserRole(session.organizationId, userId, newRole);
  await audit(session, "team.role_change", userId, "SUCCESS", { from: target.actor.role, to: newRole });
  return { ok: true, message: `Role changed to ${newRole.toLowerCase().replace("_", " ")}.` };
}

export async function setTeamStatus(
  session: TenantSessionContext,
  userId: string,
  status: string,
): Promise<TeamResult> {
  if (status !== "ACTIVE" && status !== "SUSPENDED") return { ok: false, message: "Unknown status." };
  const target = await authorise(session, userId, "team.status_change");
  if (!target) return { ok: false, message: "You cannot change this person's status." };

  const result = await setMemberStatus({ organizationId: session.organizationId, memberId: userId, status });
  if (!result.ok) {
    return {
      ok: false,
      message: result.reason === "LAST_ACTIVE_ADMIN" ? "The last active administrator cannot be deactivated." : "Not found.",
    };
  }
  await audit(session, "team.status_change", userId, "SUCCESS", { from: target.member.status, to: status });
  return { ok: true, message: status === "ACTIVE" ? "Reactivated." : "Deactivated. Their sessions end at the next request." };
}

export async function saveTeamProfile(
  session: TenantSessionContext,
  userId: string,
  profile: { specialisation: string; qualifications: string; bio: string },
): Promise<TeamResult> {
  const target = await authorise(session, userId, "team.profile_update");
  if (!target) return { ok: false, message: "You cannot edit this profile." };
  const clean = (v: string, max: number) => v.trim().slice(0, max) || null;
  await updateTeamProfile(session.organizationId, userId, {
    specialisation: clean(profile.specialisation, 200),
    qualifications: clean(profile.qualifications, 300),
    bio: clean(profile.bio, 600),
  });
  await audit(session, "team.profile_update", userId, "SUCCESS", {});
  return { ok: true, message: "Profile saved." };
}

/**
 * Put a member on a practitioner's caseload (`members.assign`).
 *
 * This is the act that GRANTS the practitioner reach into the member's data (ADR-013), so
 * it is administrative and audited, and both people are re-read from this organisation.
 */
export async function assignMemberToPractitioner(
  session: TenantSessionContext,
  memberId: string,
  practitionerId: string,
): Promise<TeamResult> {
  if (!canManageMembers(actorFromSession(session)).allowed) {
    await audit(session, "team.assign_member", memberId, "DENIED", { reason: "NO_MEMBERS_PERMISSION" });
    return { ok: false, message: "You cannot assign members." };
  }
  const [member, practitioner] = await Promise.all([
    findMember(session.organizationId, memberId),
    findMember(session.organizationId, practitionerId),
  ]);
  const memberRole = member ? normaliseRole(member.storedRole) : null;
  const practitionerRole = practitioner ? normaliseRole(practitioner.storedRole) : null;
  if (!member || memberRole !== "USER") return { ok: false, message: "Choose a member." };
  if (!practitioner || !practitionerRole || !CASELOAD_TARGETS.includes(practitionerRole) || practitioner.status !== "ACTIVE") {
    return { ok: false, message: "Choose an active practitioner." };
  }
  await createAssignment(session.organizationId, practitionerId, memberId);
  await audit(session, "team.assign_member", memberId, "SUCCESS", { practitionerId });
  return { ok: true, message: `${member.fullName} assigned to ${practitioner.fullName}.` };
}
