"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/server/auth/guards";
import { canManageProgrammes } from "@/server/authorization/permissions";
import { actorFromSession } from "@/server/authorization/member-access";
import { recordAudit } from "@/server/repositories/audit-logs";
import { createMeal, setMealArchived } from "@/server/repositories/library";
import { MEAL_SLOT_VALUES, type MealSlotValue } from "@/server/db/types";

/**
 * The meal library — organisation-owned reference data, same reasoning as the yoga
 * library: administrative, org-wide, and revealing nothing about who eats what.
 *
 * Quantity is deliberately free text. Consultants prescribe "one bowl" or "two rotis",
 * not grams, and forcing a numeric field would make the honest answer unrepresentable.
 */

export interface LibraryState {
  status: "IDLE" | "DONE" | "ERROR";
  message?: string;
  fields?: Record<string, string>;
}

export async function createMealAction(
  _previous: LibraryState,
  formData: FormData,
): Promise<LibraryState> {
  const session = await requireRole("ADMIN", "TRAINER");

  const permitted = canManageProgrammes(actorFromSession(session));
  if (!permitted.allowed) {
    return { status: "ERROR", message: "You do not have permission to manage the library." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const slotRaw = String(formData.get("slot") ?? "").trim();

  const fields: Record<string, string> = {};
  if (name.length === 0) fields.name = "Give the meal a name.";

  // Validated against the enum rather than trusted, so a bad post is a field error rather
  // than a 500 from PostgreSQL.
  let slot: MealSlotValue | null = null;
  if (slotRaw !== "") {
    if (!(MEAL_SLOT_VALUES as readonly string[]).includes(slotRaw)) {
      fields.slot = "Choose a valid meal slot.";
    } else {
      slot = slotRaw as MealSlotValue;
    }
  }

  if (Object.keys(fields).length > 0) return { status: "ERROR", fields };

  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 12);

  const meal = await createMeal(session.organizationId, {
    name,
    description: String(formData.get("description") ?? "").trim() || null,
    instructions: String(formData.get("instructions") ?? "").trim() || null,
    quantity: String(formData.get("quantity") ?? "").trim() || null,
    slot,
    tags,
  });

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: "meal.created",
    resourceType: "meal",
    resourceId: meal.id,
    outcome: "SUCCESS",
    metadata: { name: meal.name, slot: meal.slot },
  });

  revalidatePath("/admin/diet");
  return { status: "DONE", message: `“${meal.name}” added to the library.` };
}

export async function archiveMealAction(
  _previous: LibraryState,
  formData: FormData,
): Promise<LibraryState> {
  const session = await requireRole("ADMIN", "TRAINER");

  const permitted = canManageProgrammes(actorFromSession(session));
  if (!permitted.allowed) {
    return { status: "ERROR", message: "You do not have permission to manage the library." };
  }

  const id = String(formData.get("id") ?? "");
  const archived = await setMealArchived(session.organizationId, id, true);

  if (!archived) return { status: "ERROR", message: "That meal no longer exists." };

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: "meal.archived",
    resourceType: "meal",
    resourceId: id,
    outcome: "SUCCESS",
  });

  revalidatePath("/admin/diet");
  return { status: "DONE", message: "Meal archived." };
}
