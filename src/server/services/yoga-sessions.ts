import { actorFromSession, resolveMemberAccess } from "@/server/authorization/member-access";
import { hasPermission } from "@/server/authorization/permissions";
import { recordAudit } from "@/server/repositories/audit-logs";
import { listCaseload } from "@/server/repositories/caseload";
import { listMembers } from "@/server/repositories/members";
import type { TenantSessionContext } from "@/server/repositories/sessions";
import {
  addParticipant,
  createSession,
  findSession,
  listParticipants,
  markAttendance,
  removeParticipant,
  setSessionStatus,
  updateSessionNotes,
  type Attendance,
  type Participant,
  type SessionStatus,
  type YogaSession,
} from "@/server/repositories/yoga-sessions";

/**
 * Yoga sessions (brief §7) — the one entry point for session actions and pages.
 *
 * THE RULES
 *   - Managing sessions needs `yoga.manage_sessions` (ADMIN, TRAINER — ADR-016).
 *   - A TRAINER schedules sessions for themselves; an ADMIN may name any yoga instructor.
 *   - A participant can be ADDED only by someone with reach to that member — an active
 *     assignment (ADR-013). Session membership is practice data.
 *   - Attendance is MARKED only by the session's instructor or an ADMIN, and only for a
 *     member they can reach.
 *   - When a session is viewed, participants the viewer cannot reach are shown only as a
 *     count — never their name or attendance. Being able to see a class is not being able
 *     to see who attended it.
 */

export type SessionResult<T = null> = { ok: true; value: T } | { ok: false; message: string };

const DENIED = { ok: false as const, message: "You do not have permission to manage sessions." };

function permitted(session: TenantSessionContext): boolean {
  return hasPermission(actorFromSession(session), "yoga.manage_sessions").allowed;
}

function audit(session: TenantSessionContext, action: string, resourceId: string, metadata: Record<string, unknown>) {
  return recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action,
    resourceType: "yoga_session",
    resourceId,
    outcome: "SUCCESS",
    metadata,
  });
}

async function canReach(session: TenantSessionContext, memberId: string): Promise<boolean> {
  return (await resolveMemberAccess(actorFromSession(session), memberId, "all")).decision.allowed;
}

/** Team members who may lead a session: those holding yoga.manage_sessions. */
export async function listInstructors(session: TenantSessionContext) {
  const team = await listMembers(session.organizationId, { kind: "STAFF" });
  return team
    .filter((m) => m.status === "ACTIVE" && (m.role === "ADMIN" || m.role === "TRAINER"))
    .map((m) => ({ id: m.id, fullName: m.fullName }));
}

export async function scheduleSession(
  session: TenantSessionContext,
  input: { title: string; startsAt: Date; durationMinutes: number; instructorId: string; notes: string | null },
): Promise<SessionResult<string>> {
  if (!permitted(session)) return DENIED;

  // A trainer leads their own classes; only an ADMIN assigns someone else.
  const instructorId = session.role === "ADMIN" ? input.instructorId : session.userId;
  const instructors = await listInstructors(session);
  if (!instructors.some((i) => i.id === instructorId)) {
    return { ok: false, message: "Choose an active yoga instructor." };
  }

  const id = await createSession(session.organizationId, { ...input, instructorId, createdBy: session.userId });
  await audit(session, "session.create", id, { instructorId, startsAt: input.startsAt.toISOString() });
  return { ok: true, value: id };
}

/** The session plus only what this viewer may see of its participants. */
export async function viewSession(
  session: TenantSessionContext,
  sessionId: string,
): Promise<
  | {
      ok: true;
      value: {
        session: YogaSession;
        visible: Participant[];
        hiddenCount: number;
        canMark: boolean;
        canManage: boolean;
        addable: Array<{ id: string; fullName: string }>;
      };
    }
  | { ok: false; message: string }
> {
  if (!permitted(session)) return DENIED;
  const found = await findSession(session.organizationId, sessionId);
  if (!found) return { ok: false, message: "That session does not exist." };

  const participants = await listParticipants(session.organizationId, sessionId);
  const reachable = await Promise.all(participants.map((p) => canReach(session, p.memberId)));
  const visible = participants.filter((_, i) => reachable[i]);

  const canManage = session.role === "ADMIN" || found.instructorId === session.userId;
  // The viewer's own caseload, minus those already in the session.
  const caseload = await listCaseload(actorFromSession(session));
  const inSession = new Set(participants.map((p) => p.memberId));
  const addable = caseload
    .filter((c) => !inSession.has(c.customerId))
    .map((c) => ({ id: c.customerId, fullName: c.fullName }));

  return {
    ok: true,
    value: {
      session: found,
      visible,
      hiddenCount: participants.length - visible.length,
      canMark: canManage,
      canManage,
      addable,
    },
  };
}

async function manageable(session: TenantSessionContext, sessionId: string) {
  if (!permitted(session)) return null;
  const found = await findSession(session.organizationId, sessionId);
  if (!found) return null;
  if (session.role !== "ADMIN" && found.instructorId !== session.userId) return null;
  return found;
}

export async function addSessionParticipant(
  session: TenantSessionContext,
  sessionId: string,
  memberId: string,
): Promise<SessionResult> {
  const found = await manageable(session, sessionId);
  if (!found) return DENIED;
  if (!(await canReach(session, memberId))) {
    return { ok: false, message: "You can only add members assigned to you." };
  }
  await addParticipant(session.organizationId, sessionId, memberId);
  await audit(session, "session.participant_add", sessionId, { memberId });
  return { ok: true, value: null };
}

export async function removeSessionParticipant(
  session: TenantSessionContext,
  sessionId: string,
  memberId: string,
): Promise<SessionResult> {
  const found = await manageable(session, sessionId);
  if (!found || !(await canReach(session, memberId))) return DENIED;
  await removeParticipant(session.organizationId, sessionId, memberId);
  await audit(session, "session.participant_remove", sessionId, { memberId });
  return { ok: true, value: null };
}

const ATTENDANCE: readonly Attendance[] = ["EXPECTED", "ATTENDED", "ABSENT", "EXCUSED"];

export async function recordAttendance(
  session: TenantSessionContext,
  sessionId: string,
  memberId: string,
  attendance: string,
): Promise<SessionResult> {
  if (!ATTENDANCE.includes(attendance as Attendance)) return { ok: false, message: "Unknown attendance value." };
  const found = await manageable(session, sessionId);
  if (!found || !(await canReach(session, memberId))) return DENIED;
  const ok = await markAttendance(session.organizationId, sessionId, memberId, attendance as Attendance, session.userId);
  if (!ok) return { ok: false, message: "That member is not in this session." };
  await audit(session, "session.attendance", sessionId, { memberId, attendance });
  return { ok: true, value: null };
}

export async function changeSessionStatus(
  session: TenantSessionContext,
  sessionId: string,
  status: string,
): Promise<SessionResult> {
  if (!["SCHEDULED", "COMPLETED", "CANCELLED"].includes(status)) return { ok: false, message: "Unknown status." };
  const found = await manageable(session, sessionId);
  if (!found) return DENIED;
  await setSessionStatus(session.organizationId, sessionId, status as SessionStatus);
  await audit(session, "session.status", sessionId, { from: found.status, to: status });
  return { ok: true, value: null };
}

export async function saveSessionNotes(
  session: TenantSessionContext,
  sessionId: string,
  notes: string,
): Promise<SessionResult> {
  const found = await manageable(session, sessionId);
  if (!found) return DENIED;
  const trimmed = notes.trim().slice(0, 2000);
  await updateSessionNotes(session.organizationId, sessionId, trimmed || null);
  return { ok: true, value: null };
}
