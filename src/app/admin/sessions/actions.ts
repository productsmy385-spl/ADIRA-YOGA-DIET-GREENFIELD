"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { zonedToUtc } from "@/lib/zoned-time";
import { requireRole } from "@/server/auth/guards";
import { findOrganizationById } from "@/server/repositories/organizations";
import {
  addSessionParticipant,
  changeSessionStatus,
  recordAttendance,
  removeSessionParticipant,
  saveSessionNotes,
  scheduleSession,
} from "@/server/services/yoga-sessions";

/**
 * Yoga session actions. Thin: `requireRole` for the session, then the service, which
 * checks `yoga.manage_sessions`, instructor ownership, and member reach for every
 * participant (ADR-013/016). The organisation always comes from the session.
 */

export interface SessionFormState {
  error?: string;
}

const scheduleSchema = z.object({
  title: z.string().trim().min(1, "Give the session a name").max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Choose a time"),
  durationMinutes: z.coerce.number().int().min(5).max(480),
  instructorId: z.string().default(""),
  notes: z.string().trim().max(2000).default(""),
});

export async function scheduleSessionAction(
  _previous: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const session = await requireRole("ADMIN", "TRAINER");
  const parsed = scheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const { title, date, time, durationMinutes, instructorId, notes } = parsed.data;
  // Entered in the ORGANISATION's timezone — the studio's 18:00, wherever the admin is.
  const organization = await findOrganizationById(session.organizationId);
  const startsAt = zonedToUtc(date, time, organization?.timezone ?? "Asia/Kolkata");
  if (!startsAt) return { error: "That date is not valid." };

  const result = await scheduleSession(session, {
    title,
    startsAt,
    durationMinutes,
    instructorId,
    notes: notes || null,
  });
  if (!result.ok) return { error: result.message };
  revalidatePath("/admin/sessions");
  redirect(`/admin/sessions/${result.value}`);
}

const ids = (formData: FormData) => ({
  sessionId: String(formData.get("sessionId") ?? ""),
  memberId: String(formData.get("memberId") ?? ""),
});

export async function addParticipantAction(formData: FormData): Promise<void> {
  const session = await requireRole("ADMIN", "TRAINER");
  const { sessionId, memberId } = ids(formData);
  await addSessionParticipant(session, sessionId, memberId);
  revalidatePath(`/admin/sessions/${sessionId}`);
}

export async function removeParticipantAction(formData: FormData): Promise<void> {
  const session = await requireRole("ADMIN", "TRAINER");
  const { sessionId, memberId } = ids(formData);
  await removeSessionParticipant(session, sessionId, memberId);
  revalidatePath(`/admin/sessions/${sessionId}`);
}

export async function markAttendanceAction(formData: FormData): Promise<void> {
  const session = await requireRole("ADMIN", "TRAINER");
  const { sessionId, memberId } = ids(formData);
  await recordAttendance(session, sessionId, memberId, String(formData.get("attendance") ?? ""));
  revalidatePath(`/admin/sessions/${sessionId}`);
}

export async function setSessionStatusAction(formData: FormData): Promise<void> {
  const session = await requireRole("ADMIN", "TRAINER");
  const sessionId = String(formData.get("sessionId") ?? "");
  await changeSessionStatus(session, sessionId, String(formData.get("status") ?? ""));
  revalidatePath(`/admin/sessions/${sessionId}`);
  revalidatePath("/admin/sessions");
}

export async function saveSessionNotesAction(formData: FormData): Promise<void> {
  const session = await requireRole("ADMIN", "TRAINER");
  const sessionId = String(formData.get("sessionId") ?? "");
  await saveSessionNotes(session, sessionId, String(formData.get("notes") ?? ""));
  revalidatePath(`/admin/sessions/${sessionId}`);
}
