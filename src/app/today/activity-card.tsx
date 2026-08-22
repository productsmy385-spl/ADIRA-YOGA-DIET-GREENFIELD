"use client";

import { Check, Loader2, SkipForward } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { DailyActivity } from "@/server/repositories/activities";

import { completeActivityAction, skipActivityAction } from "./actions";

/**
 * One activity, with the two actions a customer actually takes.
 *
 * There is no "start" button. `USER-JOURNEYS.md` J1 records that the phone will be in
 * another room during practice — a flow requiring the customer to press start beforehand
 * and complete afterwards assumes a device they are not holding. The repository still
 * supports starting, for a future guided session that genuinely tracks duration; the
 * daily loop does not ask for it.
 *
 * Completion is one tap and works whenever it happens, including the next morning.
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
