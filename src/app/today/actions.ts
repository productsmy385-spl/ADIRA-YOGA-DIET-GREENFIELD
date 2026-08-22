"use server";

import { revalidatePath } from "next/cache";

import { requireTenantSession } from "@/server/auth/guards";
import {
  completeActivity,
  skipActivity,
  startActivity,
} from "@/server/repositories/activities";
import { recordAudit } from "@/server/repositories/audit-logs";

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
