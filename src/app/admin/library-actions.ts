"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/server/auth/guards";
import { actorFromSession } from "@/server/authorization/member-access";
import { canManageProgrammes } from "@/server/authorization/permissions";
import { isUniqueViolation } from "@/server/db/unique-violation";
import { recordAudit } from "@/server/repositories/audit-logs";
import {
  createMeal,
  createYogaExercise,
  setMealArchived,
  setYogaExerciseArchived,
  updateMeal,
  updateYogaExercise,
} from "@/server/repositories/library";

/**
 * The organisation's yoga and diet library.
 *
 * ADMINISTRATIVE, and one of the clearest cases of it: an exercise or a meal belongs to the
 * organisation, describes nobody, and carries no health information about anyone. So
 * `canManageProgrammes` is the whole authorization question — no assignment is involved,
 * and ADR-013's data-reach rule never enters.
 *
 * Both halves live in one module because they are the same shape of operation on two
 * tables, and splitting them would duplicate the guard, the audit call and the
 * revalidation three times over.
 *
 * ARCHIVE, NEVER DELETE. `setYogaExerciseArchived` and `setMealArchived` are the only
 * removal path offered. A programme item snapshots its content at assignment time
 * (ADR-009), so deleting an exercise cannot corrupt an assignment already made — but it
 * would erase the library's own history, and a consultant asking "what did we used to
 * prescribe" deserves an answer.
 */

const yogaSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  instructions: z.string().trim().max(5000).optional(),
  breathing: z.string().trim().max(2000).optional(),
  difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).default("BEGINNER"),
  // Entered in MINUTES, because that is how a consultant thinks about a pose, and stored
  // in seconds because that is what the activity engine counts.
  durationMinutes: z.coerce.number().int().min(0).max(180).optional(),
  repetitions: z.coerce.number().int().min(0).max(500).optional(),
});

const mealSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  instructions: z.string().trim().max(5000).optional(),
  quantity: z.string().trim().max(200).optional(),
  slot: z.enum(["BREAKFAST", "LUNCH", "SNACK", "DINNER"]).optional(),
  tags: z.string().trim().max(500).optional(),
});

export interface LibraryState {
  status: "IDLE" | "DONE" | "ERROR";
  message?: string;
  fieldErrors?: Record<string, string>;
}

/** Empty strings from a form mean "not provided", not "set to empty". */
function orNull(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

/* ── yoga ──────────────────────────────────────────────────────────────── */

export async function saveYogaExerciseAction(
  _previous: LibraryState,
  formData: FormData,
): Promise<LibraryState> {
  const session = await requireRole("ADMIN", "TRAINER");
  if (!canManageProgrammes(actorFromSession(session)).allowed) {
    return { status: "ERROR", message: "You do not have permission to edit the library." };
  }

  const parsed = yogaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "ERROR",
      message: "Check the form and try again.",
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((issue) => [
          String(issue.path[0] ?? "form"),
          issue.path[0] === "name" ? "A name is required." : "That value is not valid.",
        ]),
      ),
    };
  }

  const input = {
    name: parsed.data.name,
    description: orNull(parsed.data.description),
    instructions: orNull(parsed.data.instructions),
    breathing: orNull(parsed.data.breathing),
    difficulty: parsed.data.difficulty,
    defaultDurationSeconds: parsed.data.durationMinutes
      ? parsed.data.durationMinutes * 60
      : null,
    defaultRepetitions: parsed.data.repetitions ?? null,
  };

  // Present means edit, absent means create. One action for both, because the validation
  // and the authorization are identical and the difference is one statement.
  const exerciseId = String(formData.get("exerciseId") ?? "").trim() || null;

  try {
    const saved = exerciseId
      ? await updateYogaExercise(session.organizationId, exerciseId, input)
      : await createYogaExercise(session.organizationId, input);

    if (!saved) {
      // The id did not resolve WITHIN this organisation. Reported as absent rather than
      // forbidden: whether it exists in another tenant is not something to disclose.
      return { status: "ERROR", message: "That exercise no longer exists." };
    }

    await recordAudit({
      organizationId: session.organizationId,
      actorDomain: "TENANT",
      actorId: session.userId,
      actorLabel: session.email,
      action: exerciseId ? "yoga_exercise.update" : "yoga_exercise.create",
      resourceType: "yoga_exercise",
      resourceId: saved.id,
      outcome: "SUCCESS",
      metadata: { difficulty: input.difficulty },
    });

    revalidatePath("/admin/yoga");
    return {
      status: "DONE",
      message: exerciseId ? "Exercise updated." : `"${saved.name}" added to the library.`,
    };
  } catch (error) {
    if (isUniqueViolation(error, "yoga_exercise_name_unique_per_org")) {
      return {
        status: "ERROR",
        message: "An exercise with that name already exists.",
        fieldErrors: { name: "Already in this library." },
      };
    }
    throw error;
  }
}

export async function archiveYogaExerciseAction(formData: FormData): Promise<void> {
  const session = await requireRole("ADMIN", "TRAINER");
  if (!canManageProgrammes(actorFromSession(session)).allowed) return;

  const exerciseId = String(formData.get("exerciseId") ?? "");
  const archived = String(formData.get("archived") ?? "true") === "true";

  const result = await setYogaExerciseArchived(
    session.organizationId,
    exerciseId,
    archived,
  );
  if (!result) return;

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: archived ? "yoga_exercise.archive" : "yoga_exercise.restore",
    resourceType: "yoga_exercise",
    resourceId: exerciseId,
    outcome: "SUCCESS",
  });

  revalidatePath("/admin/yoga");
}

/* ── diet ──────────────────────────────────────────────────────────────── */

export async function saveMealAction(
  _previous: LibraryState,
  formData: FormData,
): Promise<LibraryState> {
  const session = await requireRole("ADMIN", "TRAINER");
  if (!canManageProgrammes(actorFromSession(session)).allowed) {
    return { status: "ERROR", message: "You do not have permission to edit the library." };
  }

  const parsed = mealSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "ERROR",
      message: "Check the form and try again.",
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((issue) => [
          String(issue.path[0] ?? "form"),
          issue.path[0] === "name" ? "A name is required." : "That value is not valid.",
        ]),
      ),
    };
  }

  const input = {
    name: parsed.data.name,
    description: orNull(parsed.data.description),
    instructions: orNull(parsed.data.instructions),
    quantity: orNull(parsed.data.quantity),
    slot: parsed.data.slot ?? null,
    /*
     * Tags arrive as one comma-separated field, which is what an admin types. Split,
     * trimmed, blanks dropped, deduplicated — an accidental trailing comma should not
     * create an empty tag that then appears as a filter nobody can select.
     */
    tags: [
      ...new Set(
        (parsed.data.tags ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      ),
    ],
  };

  const mealId = String(formData.get("mealId") ?? "").trim() || null;

  try {
    const saved = mealId
      ? await updateMeal(session.organizationId, mealId, input)
      : await createMeal(session.organizationId, input);

    if (!saved) return { status: "ERROR", message: "That meal no longer exists." };

    await recordAudit({
      organizationId: session.organizationId,
      actorDomain: "TENANT",
      actorId: session.userId,
      actorLabel: session.email,
      action: mealId ? "meal.update" : "meal.create",
      resourceType: "meal",
      resourceId: saved.id,
      outcome: "SUCCESS",
      metadata: { slot: input.slot },
    });

    revalidatePath("/admin/diet");
    return {
      status: "DONE",
      message: mealId ? "Meal updated." : `"${saved.name}" added to the library.`,
    };
  } catch (error) {
    if (isUniqueViolation(error, "meal_name_unique_per_org")) {
      return {
        status: "ERROR",
        message: "A meal with that name already exists.",
        fieldErrors: { name: "Already in this library." },
      };
    }
    throw error;
  }
}

export async function archiveMealAction(formData: FormData): Promise<void> {
  const session = await requireRole("ADMIN", "TRAINER");
  if (!canManageProgrammes(actorFromSession(session)).allowed) return;

  const mealId = String(formData.get("mealId") ?? "");
  const archived = String(formData.get("archived") ?? "true") === "true";

  const result = await setMealArchived(session.organizationId, mealId, archived);
  if (!result) return;

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: archived ? "meal.archive" : "meal.restore",
    resourceType: "meal",
    resourceId: mealId,
    outcome: "SUCCESS",
  });

  revalidatePath("/admin/diet");
}
