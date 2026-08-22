"use server";

import { revalidatePath } from "next/cache";

import { requireTenantSession } from "@/server/auth/guards";
import {
  completeActivity,
  organizationToday,
  skipActivity,
  startActivity,
} from "@/server/repositories/activities";
import { recordAudit } from "@/server/repositories/audit-logs";
import { upsertCheckIn } from "@/server/repositories/checkins";

/**
 * The customer's own daily actions.
 *
 * THE OWNERSHIP RULE, AND WHY IT NEEDS NO PERMISSION CHECK
 *
 * Every action below passes `session.userId` as the customer id. It is never taken from
 * the form. So the only activities a caller can advance are their own, by construction —
 * there is no id to tamper with, because the identifying value never leaves the server.
 *
 * That is deliberately stronger than validating a submitted id against the session. A
 * check can be forgotten in a new action; a value that is never accepted cannot be.
 *
 * The repository then scopes by organisation *and* customer anyway, so a bug here is
 * caught there too.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

const GENERIC_FAILURE =
  "That could not be updated. Refresh the page and try again.";

async function transition(
  activityId: string,
  action: "start" | "complete" | "skip",
  note?: string | null,
): Promise<ActionResult> {
  const session = await requireTenantSession();

  if (typeof activityId !== "string" || activityId.length === 0) {
    return { ok: false, error: GENERIC_FAILURE };
  }

  const run = {
    start: () => startActivity(session.organizationId, session.userId, activityId),
    complete: () => completeActivity(session.organizationId, session.userId, activityId),
    skip: () => skipActivity(session.organizationId, session.userId, activityId, note),
  }[action];

  const result = await run();

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: `activity.${action}`,
    resourceType: "daily_activity",
    resourceId: activityId,
    outcome: result.ok ? "SUCCESS" : "FAILURE",
  });

  if (!result.ok) {
    // One message for every failure. "Not yours", "already completed", and "no such
    // activity" are different facts, and distinguishing them would let a caller probe
    // for activity ids belonging to other people.
    return { ok: false, error: GENERIC_FAILURE };
  }

  revalidatePath("/today");
  return { ok: true };
}

export async function startActivityAction(activityId: string): Promise<ActionResult> {
  return transition(activityId, "start");
}

export async function completeActivityAction(activityId: string): Promise<ActionResult> {
  return transition(activityId, "complete");
}

export async function skipActivityAction(
  activityId: string,
  note?: string,
): Promise<ActionResult> {
  return transition(activityId, "skip", note?.trim() || null);
}

/**
 * Save or amend today's check-in.
 *
 * Values are clamped rather than rejected. A band outside 1–5 or a negative glass count
 * can only come from a tampered request — there is no UI path to it — and the useful
 * response to nonsense is to store nothing harmful, not to argue with it. The schema's
 * CHECK constraints are the real guarantee; this keeps a malformed request from becoming
 * a constraint violation the customer sees as a crash.
 */
function band(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

export async function saveCheckInAction(input: {
  mood?: number | null;
  sleepQuality?: number | null;
  waterGlasses?: number | null;
  notes?: string | null;
}): Promise<ActionResult> {
  const session = await requireTenantSession();
  const today = await organizationToday(session.organizationId);

  const water =
    typeof input.waterGlasses === "number" && Number.isFinite(input.waterGlasses)
      ? Math.min(50, Math.max(0, Math.round(input.waterGlasses)))
      : null;

  try {
    await upsertCheckIn(session.organizationId, session.userId, today, {
      mood: band(input.mood),
      sleepQuality: band(input.sleepQuality),
      waterGlasses: water,
      // Bounded so a paste cannot write an unbounded blob into a health record.
      notes: input.notes ? String(input.notes).slice(0, 2000) : null,
    });
  } catch (error) {
    console.error("[check-in] save failed", error);
    return { ok: false, error: "Your check-in could not be saved. Please try again." };
  }

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: "checkin.save",
    resourceType: "daily_checkin",
    // The check-in's CONTENT is health data and does not belong in an audit trail read
    // by staff for operational reasons. That it happened, and when, is the useful part.
    outcome: "SUCCESS",
  });

  revalidatePath("/today");
  return { ok: true };
}
