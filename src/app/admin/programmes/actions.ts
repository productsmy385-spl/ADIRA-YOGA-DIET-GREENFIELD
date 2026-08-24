"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/server/auth/guards";
import { actorFromSession } from "@/server/authorization/member-access";
import { canManageOrganization } from "@/server/authorization/permissions";
import { isUniqueViolation } from "@/server/db/unique-violation";
import { recordAudit } from "@/server/repositories/audit-logs";
import {
  addProgrammeItem,
  createProgramme,
  duplicateProgramme,
  removeProgrammeItem,
  setProgrammeArchived,
  updateProgramme,
} from "@/server/repositories/programmes";

/**
 * Building programmes — yoga and diet alike.
 *
 * ONE MODULE FOR BOTH KINDS, because in the schema they ARE one thing: `programmes.kind`
 * is YOGA or DIET, and `programme_items` carries `yoga_exercise_id`, `meal_id` and `slot`
 * on the same row. A "diet plan builder" written separately would be a second
 * implementation of this file that drifted from it.
 *
 * ADMINISTRATIVE. A programme is a template owned by the organisation; it names no member
 * and holds no health data, so `canManageOrganization` is the whole question. Assignment —
 * the act that attaches a template to a person — is where member data reach starts, and
 * that lives elsewhere.
 *
 * EVERY MUTATION BUMPS `programmes.version`, in the repository. The version is copied onto
 * an assignment, so "which version of Foundation was Anita given" stays answerable after
 * the template moves on (ADR-009). Nothing here should bypass a repository function to
 * avoid the bump.
 */

const programmeSchema = z.object({
  kind: z.enum(["YOGA", "DIET"]),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  durationWeeks: z.coerce.number().int().min(1).max(52).default(4),
  difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).default("BEGINNER"),
});

/**
 * An item's position and content.
 *
 * `dayOfWeek` is 1–7 and `weekNumber` starts at 1, matching the schema's own CHECKs. The
 * ranges are asserted here as well so a malformed post produces a field error rather than
 * a constraint violation surfacing as a 500.
 */
const itemSchema = z
  .object({
    programmeId: z.uuid(),
    weekNumber: z.coerce.number().int().min(1).max(52),
    dayOfWeek: z.coerce.number().int().min(1).max(7),
    yogaExerciseId: z.uuid().optional(),
    mealId: z.uuid().optional(),
    slot: z.enum(["BREAKFAST", "LUNCH", "SNACK", "DINNER"]).optional(),
    durationMinutes: z.coerce.number().int().min(0).max(180).optional(),
    repetitions: z.coerce.number().int().min(0).max(500).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((value) => Boolean(value.yogaExerciseId) !== Boolean(value.mealId), {
    // Exactly one. Both would be a row that is an exercise AND a meal; neither would be a
    // row that prescribes nothing but still occupies a position in someone's day.
    message: "Choose either an exercise or a meal.",
    path: ["yogaExerciseId"],
  });

export interface ProgrammeState {
  status: "IDLE" | "DONE" | "ERROR";
  message?: string;
  fieldErrors?: Record<string, string>;
}

async function requireAdmin() {
  const session = await requireRole("ADMIN");
  if (!canManageOrganization(actorFromSession(session)).allowed) return null;
  return session;
}

/* ── the programme itself ──────────────────────────────────────────────── */

export async function createProgrammeAction(
  _previous: ProgrammeState,
  formData: FormData,
): Promise<ProgrammeState> {
  const session = await requireAdmin();
  if (!session) {
    return { status: "ERROR", message: "You do not have permission to build programmes." };
  }

  const parsed = programmeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "ERROR",
      message: "Check the form and try again.",
      fieldErrors: { name: "A name is required." },
    };
  }

  let createdId: string;

  try {
    const programme = await createProgramme(session.organizationId, {
      kind: parsed.data.kind,
      name: parsed.data.name,
      description: parsed.data.description || null,
      durationWeeks: parsed.data.durationWeeks,
      difficulty: parsed.data.difficulty,
    });
    createdId = programme.id;

    await recordAudit({
      organizationId: session.organizationId,
      actorDomain: "TENANT",
      actorId: session.userId,
      actorLabel: session.email,
      action: "programme.create",
      resourceType: "programme",
      resourceId: programme.id,
      outcome: "SUCCESS",
      metadata: { kind: parsed.data.kind, durationWeeks: parsed.data.durationWeeks },
    });
  } catch (error) {
    if (isUniqueViolation(error, "programme_name_unique_per_org")) {
      return {
        status: "ERROR",
        message: "A programme of this kind already has that name.",
        fieldErrors: { name: "Already used." },
      };
    }
    throw error;
  }

  /*
   * Straight into the builder.
   *
   * An empty programme is not usable, and returning to a list would leave the admin to
   * find the thing they just made before they can add anything to it. `redirect` throws,
   * so it must be outside the try — catching it would swallow the navigation.
   */
  revalidatePath("/admin/programmes");
  redirect(`/admin/programmes/${createdId}`);
}

export async function updateProgrammeAction(
  _previous: ProgrammeState,
  formData: FormData,
): Promise<ProgrammeState> {
  const session = await requireAdmin();
  if (!session) return { status: "ERROR", message: "You do not have permission." };

  const programmeId = String(formData.get("programmeId") ?? "");
  const parsed = programmeSchema.omit({ kind: true }).safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      status: "ERROR",
      message: "Check the form and try again.",
      fieldErrors: { name: "A name is required." },
    };
  }

  try {
    const updated = await updateProgramme(session.organizationId, programmeId, {
      name: parsed.data.name,
      description: parsed.data.description || null,
      durationWeeks: parsed.data.durationWeeks,
      difficulty: parsed.data.difficulty,
    });

    if (!updated) return { status: "ERROR", message: "That programme no longer exists." };

    await recordAudit({
      organizationId: session.organizationId,
      actorDomain: "TENANT",
      actorId: session.userId,
      actorLabel: session.email,
      action: "programme.update",
      resourceType: "programme",
      resourceId: programmeId,
      outcome: "SUCCESS",
      metadata: { version: updated.version },
    });

    revalidatePath(`/admin/programmes/${programmeId}`);
    revalidatePath("/admin/programmes");
    return { status: "DONE", message: "Programme updated." };
  } catch (error) {
    if (isUniqueViolation(error, "programme_name_unique_per_org")) {
      return {
        status: "ERROR",
        message: "A programme of this kind already has that name.",
        fieldErrors: { name: "Already used." },
      };
    }
    throw error;
  }
}

export async function duplicateProgrammeAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  if (!session) return;

  const programmeId = String(formData.get("programmeId") ?? "");
  const copy = await duplicateProgramme(session.organizationId, programmeId);
  if (!copy) return;

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: "programme.duplicate",
    resourceType: "programme",
    resourceId: copy.id,
    outcome: "SUCCESS",
    metadata: { copiedFrom: programmeId, items: copy.itemCount },
  });

  revalidatePath("/admin/programmes");
  redirect(`/admin/programmes/${copy.id}`);
}

export async function archiveProgrammeAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  if (!session) return;

  const programmeId = String(formData.get("programmeId") ?? "");
  const archived = String(formData.get("archived") ?? "true") === "true";

  const ok = await setProgrammeArchived(session.organizationId, programmeId, archived);
  if (!ok) return;

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: archived ? "programme.archive" : "programme.restore",
    resourceType: "programme",
    resourceId: programmeId,
    outcome: "SUCCESS",
  });

  /*
   * Archiving withdraws a template from FUTURE assignment. It does not touch assignments
   * already made — those hold snapshots, not references (ADR-009) — so nobody's current
   * plan changes because an admin tidied the template list.
   */
  revalidatePath("/admin/programmes");
  revalidatePath(`/admin/programmes/${programmeId}`);
}

/* ── items ─────────────────────────────────────────────────────────────── */

export async function addProgrammeItemAction(
  _previous: ProgrammeState,
  formData: FormData,
): Promise<ProgrammeState> {
  const session = await requireAdmin();
  if (!session) return { status: "ERROR", message: "You do not have permission." };

  const raw = Object.fromEntries(formData);
  // Blank selects arrive as "" and would fail uuid parsing; absent is what they mean.
  for (const key of ["yogaExerciseId", "mealId", "slot", "notes"]) {
    if (raw[key] === "") delete raw[key];
  }

  const parsed = itemSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: "ERROR",
      message:
        parsed.error.issues[0]?.message ?? "Check the position and selection, then retry.",
    };
  }

  const { programmeId, durationMinutes, ...rest } = parsed.data;

  try {
    await addProgrammeItem(session.organizationId, programmeId, {
      weekNumber: rest.weekNumber,
      dayOfWeek: rest.dayOfWeek,
      yogaExerciseId: rest.yogaExerciseId ?? null,
      mealId: rest.mealId ?? null,
      slot: rest.slot ?? null,
      // Minutes in the form, seconds in the column — the same conversion the library
      // forms make, for the same reason.
      durationSeconds: durationMinutes ? durationMinutes * 60 : null,
      repetitions: rest.repetitions ?? null,
      notes: rest.notes ?? null,
    });
  } catch (error) {
    // The repository throws this when the programme is not in this organisation.
    if (error instanceof Error && error.message === "Programme not found.") {
      return { status: "ERROR", message: "That programme no longer exists." };
    }
    if (isUniqueViolation(error, "programme_item_position_unique")) {
      return {
        status: "ERROR",
        message: "Something else already occupies that position. Refresh and try again.",
      };
    }
    throw error;
  }

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: "programme_item.add",
    resourceType: "programme",
    resourceId: programmeId,
    outcome: "SUCCESS",
    metadata: { week: rest.weekNumber, day: rest.dayOfWeek },
  });

  revalidatePath(`/admin/programmes/${programmeId}`);
  return { status: "DONE", message: "Added." };
}

export async function removeProgrammeItemAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  if (!session) return;

  const programmeId = String(formData.get("programmeId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");

  const removed = await removeProgrammeItem(session.organizationId, programmeId, itemId);
  if (!removed) return;

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: "programme_item.remove",
    resourceType: "programme",
    resourceId: programmeId,
    outcome: "SUCCESS",
    metadata: { itemId },
  });

  revalidatePath(`/admin/programmes/${programmeId}`);
}
