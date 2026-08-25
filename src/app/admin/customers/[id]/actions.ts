"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/server/auth/guards";
import {
  actorFromSession,
  resolveMemberAccessAudited,
} from "@/server/authorization/member-access";
import { canManageOrganization } from "@/server/authorization/permissions";
import {
  activateAssignment,
  createAssignmentFromProgramme,
  findAssignment,
  pauseAssignment,
} from "@/server/repositories/assignments";
import { recordAudit } from "@/server/repositories/audit-logs";
import { createNotification } from "@/server/repositories/notifications";
import { createAssignment, endAssignment } from "@/server/repositories/members";
import { organizationToday } from "@/server/repositories/activities";

/**
 * Prescribing — the point where administration becomes member data.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * TWO DIFFERENT AUTHORIZATION QUESTIONS, DELIBERATELY NOT ONE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * TAKING A MEMBER INTO A CASELOAD is administrative. It creates the consultant
 * relationship and reads nothing about the person, so `canManageOrganization` is the
 * right gate — and it MUST be, or the product deadlocks: a new member has no assignment,
 * so requiring data reach to create one would mean nobody could ever start.
 *
 * PRESCRIBING A PROGRAMME is member data. It writes into somebody's health record and
 * generates their activity schedule, so it goes through `resolveMemberAccess` exactly as
 * reading their practice does. An admin who has not taken this member on cannot hand them
 * a plan.
 *
 * Conflating the two in either direction is a real failure: gate both administratively and
 * any admin can prescribe for a stranger; gate both by data reach and the first member can
 * never be started.
 *
 * The order an admin actually follows is: add the member → take them into the caseload →
 * prescribe. Each step is authorised by the question it actually raises.
 */

const assignSchema = z.object({
  customerId: z.uuid(),
  programmeId: z.uuid(),
  // A date, not a timestamp: a plan starts on a day in the organisation's timezone, and
  // `starts_on` is a DATE column. See `formatDateColumn` for why this stays a string.
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date."),
  durationWeeks: z.coerce.number().int().min(1).max(52).optional(),
  // Activating immediately generates the daily activities. Left off, the plan is a DRAFT
  // the member cannot see yet.
  activate: z.coerce.boolean().optional(),
});

export interface AssignState {
  status: "IDLE" | "DONE" | "ERROR";
  message?: string;
}

/** Both questions asked, in the order that fails cheapest first. */
async function requireMemberReach(customerId: string, action: string) {
  const session = await requireRole("ADMIN");
  const actor = actorFromSession(session);

  if (!canManageOrganization(actor).allowed) return null;

  const { decision } = await resolveMemberAccessAudited(actor, customerId, action);
  if (!decision.allowed) return null;

  return session;
}

/* ── caseload ──────────────────────────────────────────────────────────── */

export async function takeIntoCaseloadAction(formData: FormData): Promise<void> {
  const session = await requireRole("ADMIN");
  const actor = actorFromSession(session);

  // Administrative only — see the header for why this must NOT require data reach.
  if (!canManageOrganization(actor).allowed) return;

  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) return;

  await createAssignment(session.organizationId, session.userId, customerId);

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: "caseload.assign",
    resourceType: "user",
    resourceId: customerId,
    outcome: "SUCCESS",
    // The consultant is the actor; recording it explicitly makes "who could see this
    // member, and from when" answerable from the trail alone.
    metadata: { consultantId: session.userId },
  });

  revalidatePath(`/admin/customers/${customerId}`);
}

export async function releaseFromCaseloadAction(formData: FormData): Promise<void> {
  const session = await requireRole("ADMIN");
  if (!canManageOrganization(actorFromSession(session)).allowed) return;

  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) return;

  await endAssignment(session.organizationId, session.userId, customerId);

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: "caseload.release",
    resourceType: "user",
    resourceId: customerId,
    outcome: "SUCCESS",
  });

  /*
   * Releasing withdraws this admin's access to the member's data immediately — the
   * assignment row is closed, and `hasActiveAssignment` filters on `ended_at IS NULL`.
   * The member's plans and history are untouched: ending a relationship is not a reason
   * to delete somebody's record.
   */
  revalidatePath(`/admin/customers/${customerId}`);
}

/* ── prescribing ───────────────────────────────────────────────────────── */

export async function assignProgrammeAction(
  _previous: AssignState,
  formData: FormData,
): Promise<AssignState> {
  const raw = Object.fromEntries(formData);
  const parsed = assignSchema.safeParse({
    ...raw,
    activate: raw.activate === "on" || raw.activate === "true",
  });

  if (!parsed.success) {
    return {
      status: "ERROR",
      message: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }

  const { customerId, programmeId, startsOn, durationWeeks, activate } = parsed.data;

  const session = await requireMemberReach(customerId, "assignment.create");
  if (!session) {
    // Same message for "not permitted" and "not in your caseload". Distinguishing them
    // would confirm that a member exists whom this admin may not see.
    return { status: "ERROR", message: "You cannot prescribe for this member." };
  }

  // A plan starting in the past would generate activities already overdue on day one.
  const today = await organizationToday(session.organizationId);
  if (startsOn < today) {
    return { status: "ERROR", message: "A plan cannot start before today." };
  }

  let assignmentId: string;
  let kind: string;

  try {
    const assignment = await createAssignmentFromProgramme({
      organizationId: session.organizationId,
      customerId,
      assignedBy: session.userId,
      programmeId,
      startsOn,
      durationWeeks,
    });
    assignmentId = assignment.id;
    kind = assignment.kind;
  } catch (error) {
    if (error instanceof Error && error.message === "Programme not found.") {
      // Also the cross-tenant answer: the repository scopes by organization, so another
      // organisation's programme is indistinguishable from one that does not exist.
      return { status: "ERROR", message: "That programme is not available." };
    }
    throw error;
  }

  let activitiesCreated = 0;
  if (activate) {
    // Separate from creation on purpose: the snapshot is the commitment, and generating
    // the schedule is a second transaction that can be retried without duplicating the
    // plan. `activateAssignment` is idempotent via ON CONFLICT DO NOTHING.
    ({ activitiesCreated } = await activateAssignment(session.organizationId, assignmentId));
  }

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: "assignment.create",
    resourceType: "assignment",
    resourceId: assignmentId,
    outcome: "SUCCESS",
    metadata: {
      customerId,
      programmeId,
      kind,
      startsOn,
      activated: Boolean(activate),
      activitiesCreated,
    },
  });

  revalidatePath(`/admin/customers/${customerId}`);

  return {
    status: "DONE",
    message: activate
      ? `Plan assigned and started — ${activitiesCreated} session${activitiesCreated === 1 ? "" : "s"} scheduled.`
      : "Plan assigned as a draft. Start it when you are ready.",
  };
}

export async function activateAssignmentAction(formData: FormData): Promise<void> {
  const customerId = String(formData.get("customerId") ?? "");
  const assignmentId = String(formData.get("assignmentId") ?? "");

  const session = await requireMemberReach(customerId, "assignment.activate");
  if (!session) return;

  // The assignment must belong to this member, not merely to this organisation —
  // otherwise a posted id could start somebody else's plan from this member's page.
  const assignment = await findAssignment(session.organizationId, assignmentId);
  if (!assignment || assignment.customerId !== customerId) return;

  const { activitiesCreated } = await activateAssignment(
    session.organizationId,
    assignmentId,
  );

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: "assignment.activate",
    resourceType: "assignment",
    resourceId: assignmentId,
    outcome: "SUCCESS",
    metadata: { customerId, activitiesCreated },
  });

  revalidatePath(`/admin/customers/${customerId}`);
}

export async function pauseAssignmentAction(formData: FormData): Promise<void> {
  const customerId = String(formData.get("customerId") ?? "");
  const assignmentId = String(formData.get("assignmentId") ?? "");

  const session = await requireMemberReach(customerId, "assignment.pause");
  if (!session) return;

  const assignment = await findAssignment(session.organizationId, assignmentId);
  if (!assignment || assignment.customerId !== customerId) return;

  await pauseAssignment(session.organizationId, assignmentId);

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: "assignment.pause",
    resourceType: "assignment",
    resourceId: assignmentId,
    outcome: "SUCCESS",
    metadata: { customerId },
  });

  /*
   * Pausing deletes FUTURE pending activities so a paused plan cannot accumulate misses
   * (docs/METRICS.md). What already happened — completed, skipped, missed — is left
   * exactly as it is: a status change is not a licence to rewrite history.
   */
  revalidatePath(`/admin/customers/${customerId}`);
}

/* ── messaging ─────────────────────────────────────────────────────────── */

const messageSchema = z.object({
  customerId: z.uuid(),
  title: z.string().trim().min(1, "Give the message a subject.").max(120),
  body: z.string().trim().min(1, "Write something to send.").max(2000),
});

/**
 * Send one member a message from their consultant.
 *
 * `CONSULTANT_MESSAGE` has been a notification kind with configured channels since
 * migration 005, and nothing in the product ever created one — the type existed, the
 * delivery preferences existed, and there was no way for a consultant to say anything to
 * anybody.
 *
 * GATED BY DATA REACH, NOT BY ADMINISTRATIVE REACH.
 *
 * This is the deliberate choice, and it is the stricter of the two. Messaging does not
 * READ a health record, so an administrative gate would be defensible on the letter of
 * ADR-013 — but a message is part of the therapeutic relationship, and gating it
 * administratively would give every admin in the organisation a direct channel to every
 * member. `requireMemberReach` asks both questions, so a consultant must have taken this
 * member on first, exactly as they must before prescribing.
 *
 * The recipient is validated rather than trusted: `resolveMemberAccess` establishes the
 * member is in the actor's own organisation before the assignment lookup, and
 * `createNotification` writes against a composite foreign key that requires the recipient
 * to belong to the stated organisation. A forged id fails at both.
 */
export async function sendMemberNotificationAction(
  _previous: AssignState,
  formData: FormData,
): Promise<AssignState> {
  const parsed = messageSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      status: "ERROR",
      message: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }

  const { customerId, title, body } = parsed.data;

  const session = await requireMemberReach(customerId, "notification.send");
  if (!session) {
    return { status: "ERROR", message: "You cannot message this member." };
  }

  const notification = await createNotification({
    organizationId: session.organizationId,
    recipientId: customerId,
    senderId: session.userId,
    kind: "CONSULTANT_MESSAGE",
    title,
    body,
    // Somewhere real to land. A notification whose only content is "you have a message"
    // and which goes nowhere is the dead control this pass exists to remove.
    link: "/notifications",
  });

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: "notification.send",
    resourceType: "notification",
    resourceId: notification.id,
    outcome: "SUCCESS",
    /*
     * The SUBJECT is recorded, the body is not. Who messaged whom and when is the
     * accountability the trail exists for; the contents are the member's, and copying
     * them into `audit_logs` would duplicate health-adjacent material into a table with a
     * different retention and a much wider read.
     */
    metadata: { customerId, kind: "CONSULTANT_MESSAGE", title },
  });

  revalidatePath(`/admin/customers/${customerId}`);
  return { status: "DONE", message: "Message sent." };
}
