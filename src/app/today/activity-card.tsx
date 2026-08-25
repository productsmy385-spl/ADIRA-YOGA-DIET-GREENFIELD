"use client";

import { Check, Loader2, Play, SkipForward } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { DailyActivity } from "@/server/repositories/activities";

import {
  completeActivityAction,
  skipActivityAction,
  startActivityAction,
} from "./actions";

/**
 * One activity, and the actions a customer takes on it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY "START" IS HERE NOW, WHEN IT DELIBERATELY WAS NOT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This card previously offered Done and Skip only, on the reasoning recorded in
 * `USER-JOURNEYS.md` J1: the phone is in another room during practice, so a flow that
 * REQUIRES pressing start beforehand assumes a device the customer is not holding.
 *
 * That reasoning is still right, and the current product requirement supersedes the
 * conclusion — the lifecycle is specified as PENDING → STARTED → COMPLETED, with
 * `started_at` persisted. Both hold at once, because Start is OPTIONAL:
 *
 *   · Done remains available directly from PENDING. `completeActivity` accepts PENDING,
 *     STARTED and MISSED, so the one-tap path J1 protects is untouched and completing a
 *     morning practice that evening still works.
 *   · Start is offered as a secondary control for somebody who does have their phone,
 *     and records when they began.
 *
 * Start is therefore additive. It is not a step anybody is forced through, which is the
 * property J1 actually cared about.
 *
 * `startActivity` guards its own transition — it updates only rows still in PENDING — so
 * a double tap or a stale page cannot move an activity backwards.
 */

const DONE_STATUSES = new Set(["COMPLETED", "SKIPPED"]);

function minutes(seconds: number | null): string | null {
  if (!seconds) return null;
  const value = Math.round(seconds / 60);
  return `${value} min`;
}

export function ActivityCard({ activity }: { activity: DailyActivity }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const settled = DONE_STATUSES.has(activity.status);
  const completed = activity.status === "COMPLETED";
  const started = activity.status === "STARTED";
  const duration = minutes(activity.durationSeconds);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "That did not work.");
    });
  }

  return (
    <li
      className={`rounded-lg border p-5 transition-colors ${
        settled ? "border-border bg-muted/40" : "border-border bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className={`font-medium ${
                completed ? "text-muted-foreground line-through" : "text-card-foreground"
              }`}
            >
              {activity.title}
            </h3>

            {activity.slot && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                {activity.slot.toLowerCase()}
              </span>
            )}

            {duration && (
              <span className="text-xs text-muted-foreground">{duration}</span>
            )}
          </div>

          {activity.instructions && (
            <p className="mt-2 text-sm/relaxed text-muted-foreground">
              {activity.instructions}
            </p>
          )}

          {activity.breathing && (
            <p className="mt-2 text-sm/relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Breathing: </span>
              {activity.breathing}
            </p>
          )}

          {activity.quantity && (
            <p className="mt-2 text-sm text-muted-foreground">{activity.quantity}</p>
          )}

          {settled && (
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              {completed ? "Completed" : "Skipped"}
            </p>
          )}

          {/* In progress, and said so. Without this the card looks identical before and
              after Start, which makes the button feel like it did nothing. */}
          {started && (
            <p className="mt-3 text-xs font-medium text-muted-foreground">In progress</p>
          )}
        </div>

        {!settled && (
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Button
              size="sm"
              onClick={() => run(() => completeActivityAction(activity.id))}
              disabled={pending}
              aria-busy={pending}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Check className="size-4" aria-hidden />
              )}
              Done
            </Button>

            {/* Only from PENDING — `startActivity` updates nothing once the row has
                moved on, so offering it to an already-started activity would be a
                control with no effect. */}
            {!started && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => run(() => startActivityAction(activity.id))}
                disabled={pending}
              >
                <Play className="size-4" aria-hidden />
                Start
              </Button>
            )}

            <Button
              size="sm"
              variant="ghost"
              onClick={() => run(() => skipActivityAction(activity.id))}
              disabled={pending}
            >
              <SkipForward className="size-4" aria-hidden />
              Skip
            </Button>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}
