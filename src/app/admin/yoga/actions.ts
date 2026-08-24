"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/server/auth/guards";
import { canManageOrganization } from "@/server/authorization/permissions";
import { actorFromSession } from "@/server/authorization/member-access";
import { recordAudit } from "@/server/repositories/audit-logs";
import { createYogaExercise, setYogaExerciseArchived } from "@/server/repositories/library";
import { DIFFICULTY_LEVEL_VALUES, type DifficultyLevelValue } from "@/server/db/types";

/**
 * The yoga library — organisation-owned reference data.
 *
 * ADMINISTRATIVE, so organization-wide and needing no assignment: an exercise belongs to
 * the organisation, not to any member, and nothing here reveals who has been given what.
 * Assignment scoping applies to a member's *practice*, not to the catalogue it is built
 * from (ADR-013).
 *
 * `organizationId` comes from the session on every call. There is no form field for it,
 * so a submitted organisation id cannot redirect a write into another tenant (ADR-004).
 */

export interface LibraryState {
  status: "IDLE" | "DONE" | "ERROR";
  message?: string;
  fields?: Record<string, string>;
}

/** Minutes in the form, seconds in the column. Consultants think in minutes. */
function minutesToSeconds(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const minutes = Number(trimmed);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.round(minutes * 60);
}

function positiveInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function createExerciseAction(
  _previous: LibraryState,
  formData: FormData,
): Promise<LibraryState> {
  const session = await requireRole("ADMIN");

  const permitted = canManageOrganization(actorFromSession(session));
  if (!permitted.allowed) {
    return { status: "ERROR", message: "You do not have permission to manage the library." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const difficultyRaw = String(formData.get("difficulty") ?? "BEGINNER");

  const fields: Record<string, string> = {};
  if (name.length === 0) fields.name = "Give the exercise a name.";

  // The select is validated against the enum rather than trusted. A posted value that is
  // not a real label would otherwise reach PostgreSQL and fail as a 500 instead of a
  // field error.
  const difficulty = (DIFFICULTY_LEVEL_VALUES as readonly string[]).includes(difficultyRaw)
    ? (difficultyRaw as DifficultyLevelValue)
    : undefined;
  if (!difficulty) fields.difficulty = "Choose a difficulty.";

  if (Object.keys(fields).length > 0) return { status: "ERROR", fields };

  const exercise = await createYogaExercise(session.organizationId, {
    name,
    description: String(formData.get("description") ?? "").trim() || null,
    instructions: String(formData.get("instructions") ?? "").trim() || null,
    breathing: String(formData.get("breathing") ?? "").trim() || null,
    defaultDurationSeconds: minutesToSeconds(String(formData.get("durationMinutes") ?? "")),
    defaultRepetitions: positiveInt(String(formData.get("repetitions") ?? "")),
    difficulty,
  });

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: "yoga_exercise.created",
    resourceType: "yoga_exercise",
    resourceId: exercise.id,
    outcome: "SUCCESS",
    metadata: { name: exercise.name, difficulty: exercise.difficulty },
  });

  revalidatePath("/admin/yoga");
  return { status: "DONE", message: `“${exercise.name}” added to the library.` };
}

export async function archiveExerciseAction(
  _previous: LibraryState,
  formData: FormData,
): Promise<LibraryState> {
  const session = await requireRole("ADMIN");

  const permitted = canManageOrganization(actorFromSession(session));
  if (!permitted.allowed) {
    return { status: "ERROR", message: "You do not have permission to manage the library." };
  }

  const id = String(formData.get("id") ?? "");

  /*
   * Archived, never deleted.
   *
   * A programme already assigned to somebody references this exercise, and its schedule
   * was snapshotted at assignment (ADR-009) — but the library row is still what an admin
   * browses. Deleting it would leave a hole in history for no gain; archiving removes it
   * from selection while keeping the record intact.
   */
  const archived = await setYogaExerciseArchived(session.organizationId, id, true);

  // False means the UPDATE matched nothing — wrong id, or another tenant's. The
  // organization_id predicate is what makes those two indistinguishable to the caller.
  if (!archived) return { status: "ERROR", message: "That exercise no longer exists." };

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: "yoga_exercise.archived",
    resourceType: "yoga_exercise",
    resourceId: id,
    outcome: "SUCCESS",
    metadata: { exerciseId: id },
  });

  revalidatePath("/admin/yoga");
  return { status: "DONE", message: "Exercise archived." };
}
