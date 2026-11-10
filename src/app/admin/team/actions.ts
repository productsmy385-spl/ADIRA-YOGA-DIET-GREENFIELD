"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/server/auth/guards";
import {
  assignMemberToPractitioner,
  changeTeamRole,
  saveTeamProfile,
  setTeamStatus,
  type TeamResult,
} from "@/server/services/team";

/**
 * Team actions. Thin: the service checks `team.*` / `members.assign`, strict rank
 * (`canActOn`, `canAssignRole`) and audits. Every id here is only a CHOICE; each person is
 * re-read from the session's organisation before anything happens.
 */

export type TeamState = { message?: string; ok?: boolean };

const result = (r: TeamResult): TeamState => ({ ok: r.ok, message: r.message });

export async function changeRoleAction(_p: TeamState, formData: FormData): Promise<TeamState> {
  const session = await requireRole("ADMIN", "TEAM_MANAGER");
  const r = await changeTeamRole(session, String(formData.get("userId") ?? ""), String(formData.get("role") ?? ""));
  revalidatePath("/admin/team");
  return result(r);
}

export async function setStatusAction(_p: TeamState, formData: FormData): Promise<TeamState> {
  const session = await requireRole("ADMIN", "TEAM_MANAGER");
  const r = await setTeamStatus(session, String(formData.get("userId") ?? ""), String(formData.get("status") ?? ""));
  revalidatePath("/admin/team");
  return result(r);
}

export async function saveProfileAction(_p: TeamState, formData: FormData): Promise<TeamState> {
  const session = await requireRole("ADMIN", "TEAM_MANAGER");
  const r = await saveTeamProfile(session, String(formData.get("userId") ?? ""), {
    specialisation: String(formData.get("specialisation") ?? ""),
    qualifications: String(formData.get("qualifications") ?? ""),
    bio: String(formData.get("bio") ?? ""),
  });
  revalidatePath("/admin/team");
  return result(r);
}

export async function assignMemberAction(_p: TeamState, formData: FormData): Promise<TeamState> {
  const session = await requireRole("ADMIN", "TEAM_MANAGER");
  const r = await assignMemberToPractitioner(
    session,
    String(formData.get("memberId") ?? ""),
    String(formData.get("practitionerId") ?? ""),
  );
  revalidatePath("/admin/team");
  revalidatePath("/admin/members");
  return result(r);
}
