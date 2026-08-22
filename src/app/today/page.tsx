import type { Metadata } from "next";

import { ThemeToggle } from "@/components/theme-toggle";
import { branding } from "@/lib/branding";
import { requireTenantSession } from "@/server/auth/guards";
import {
  listActivitiesForDate,
  listStatusesInRange,
  organizationToday,
} from "@/server/repositories/activities";
import { listAssignmentsForCustomer } from "@/server/repositories/assignments";
import { completionPercent, tally } from "@/server/services/metrics";

import { ActivityCard } from "./activity-card";

export const metadata: Metadata = { title: "Today" };
export const dynamic = "force-dynamic";

/**
 * The daily loop — the journey this product lives or dies by.
 *
 * `USER-JOURNEYS.md` J1 happens roughly 365 times a year per customer; everything else
 * happens occasionally. So today's plan is above the fold, completion is one tap, and
 * there is no navigation between opening the app and marking a practice done.
 *
 * Every figure is derived from `daily_activities` at request time. The percentage can be
 * absent — `completionPercent` returns null when nothing has resolved — and this page
 * renders that as "—" rather than 0%, because 0% would tell a customer who was given
 * nothing to do that they failed (docs/METRICS.md).
 */

function greeting(name: string): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return `${part}, ${name.split(" ")[0]}`;
}

export default async function TodayPage() {
  const session = await requireTenantSession();

  // The organisation's today, not the server's and not the browser's — two people
  // looking at the same organisation must see the same day boundary.
  const today = await organizationToday(session.organizationId);

  const [activities, assignments, weekStatuses] = await Promise.all([
    listActivitiesForDate(session.organizationId, session.userId, today),
    listAssignmentsForCustomer(session.organizationId, session.userId),
    listStatusesInRange(
      session.organizationId,
      session.userId,
      new Date(new Date(`${today}T00:00:00Z`).getTime() - 6 * 86_400_000)
        .toISOString()
        .slice(0, 10),
      today,
    ),
  ]);

  const todayCounts = tally(activities.map((a) => a.status));
  const weekPercent = completionPercent(tally(weekStatuses));

  const livePlan = assignments.find((a) => a.status === "ACTIVE");
  const hasAnyPlan = assignments.length > 0;
  const remaining = activities.filter(
    (a) => a.status === "PENDING" || a.status === "STARTED",
  ).length;

  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- static mark */}
          <img src={branding.icons.mark} alt="" aria-hidden className="size-8" />
          <span className="font-semibold tracking-tight text-foreground">
            {branding.name}
          </span>
        </div>
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-2xl px-6 pb-24">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {greeting(session.fullName)}
        </h1>

        <p className="mt-1 text-sm text-muted-foreground">
          {livePlan ? livePlan.name : "No programme is active."}
        </p>

        <section aria-label="This week" className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs tracking-widest text-muted-foreground uppercase">
              Left today
            </p>
            <p className="mt-1 text-2xl font-semibold text-card-foreground">
              {activities.length === 0 ? "—" : remaining}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs tracking-widest text-muted-foreground uppercase">
              Last 7 days
            </p>
            {/* Null, not zero. A customer given nothing to do has not failed. */}
            <p className="mt-1 text-2xl font-semibold text-card-foreground">
              {weekPercent === null ? "—" : `${weekPercent}%`}
            </p>
          </div>
        </section>

        <section aria-labelledby="today-heading" className="mt-10">
          <div className="flex items-baseline justify-between">
            <h2
              id="today-heading"
              className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
            >
              Today
            </h2>
            {activities.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {todayCounts.completed} of {activities.length} done
              </span>
            )}
          </div>

          {activities.length > 0 ? (
            <ul className="mt-4 grid gap-3">
              {activities.map((activity) => (
                <ActivityCard key={activity.id} activity={activity} />
              ))}
            </ul>
          ) : (
            /**
             * J2 names this precisely: the empty state must distinguish "nothing
             * assigned yet" from "something went wrong". A customer who cannot tell
             * which will assume the app is broken.
             */
            <div className="mt-4 rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-sm text-foreground">
                {hasAnyPlan
                  ? "Nothing scheduled for today."
                  : "Your consultant has not assigned a programme yet."}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {hasAnyPlan
                  ? "Rest days are part of the plan. Your next session will appear here."
                  : "You will see your daily practice here as soon as they do. Nothing is wrong."}
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

