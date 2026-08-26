import type { Metadata } from "next";

import { GlassCard, GlassPanel } from "@/components/glass/glass";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { AppNav, MobileTabBar } from "@/components/nav/app-nav";
import { requireTenantSession } from "@/server/auth/guards";
import {
  listActivitiesForDate,
  listStatusesInRange,
  organizationToday,
} from "@/server/repositories/activities";
import { listAssignmentsForCustomer } from "@/server/repositories/assignments";
import { findCheckIn } from "@/server/repositories/checkins";
import { completionPercent, tally } from "@/server/services/metrics";

import { ActivityCard } from "./activity-card";
import { CheckInForm } from "./check-in-form";

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

  const [activities, assignments, weekStatuses, checkIn] = await Promise.all([
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
    findCheckIn(session.organizationId, session.userId, today),
  ]);

  const todayCounts = tally(activities.map((a) => a.status));
  const weekPercent = completionPercent(tally(weekStatuses));

  const livePlan = assignments.find((a) => a.status === "ACTIVE");
  const hasAnyPlan = assignments.length > 0;
  const remaining = activities.filter(
    (a) => a.status === "PENDING" || a.status === "STARTED",
  ).length;

  return (
    // bg-canvas is the layered background from globals.css. It carries no 3D and no
    // animation — /today must stay the fastest surface in the product (ADR-014).
    <div className="theme-bg-wrapper theme-pink-harmony min-h-dvh bg-canvas sm:pl-[260px] pt-14 sm:pt-0">
      <AppNav role={session.role} currentPath="/today" />

      <main className="relative z-10 mx-auto max-w-2xl px-6 pt-8 pb-28 sm:pb-24">
        <h1 className="type-heading text-foreground">{greeting(session.fullName)}</h1>

        <p className="mt-1 text-sm text-muted-foreground">
          {livePlan ? livePlan.name : "No programme is active."}
        </p>

        <section aria-label="This week" className="mt-6 grid grid-cols-2 gap-3">
          <GlassCard>
            <p className="type-meta text-muted-foreground">Left today</p>
            <p className="type-metric mt-1 text-surface-foreground">
              {/* Null, not zero: a customer with nothing scheduled has no figure to
                  show, and rendering 0 would say they failed (docs/METRICS.md). */}
              <AnimatedNumber value={activities.length === 0 ? null : remaining} />
            </p>
          </GlassCard>

          <GlassCard>
            <p className="type-meta text-muted-foreground">Last 7 days</p>
            <p className="type-metric mt-1 text-surface-foreground">
              <AnimatedNumber value={weekPercent} suffix="%" />
            </p>
          </GlassCard>
        </section>

        <section aria-labelledby="today-heading" className="mt-10">
          <div className="flex items-baseline justify-between">
            <h2
              id="today-heading"
              className="type-meta font-semibold text-muted-foreground"
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
            /*
             * Grouped by kind, because they are two different acts.
             *
             * Yoga is a session you go and do; a meal is something you eat at a time of
             * day. A single interleaved list makes the customer read every row to find
             * what is left of their practice, and the two have different rhythms — the
             * yoga is done once, the meals are checked off across the day.
             *
             * The order is fixed rather than by schedule position: practice first, meals
             * second. Both groups keep their own internal order, which is the sequence
             * the programme prescribed.
             */
            (["YOGA", "DIET"] as const).map((kind) => {
              const forKind = activities.filter((activity) => activity.kind === kind);
              if (forKind.length === 0) return null;

              return (
                <div key={kind} className="mt-4">
                  <h3 className="type-meta text-muted-foreground">
                    {kind === "YOGA" ? "Practice" : "Meals"}
                  </h3>
                  <ul className="mt-2 grid gap-3">
                    {forKind.map((activity) => (
                      <ActivityCard key={activity.id} activity={activity} />
                    ))}
                  </ul>
                </div>
              );
            })
          ) : (
            /**
             * J2 names this precisely: the empty state must distinguish "nothing
             * assigned yet" from "something went wrong". A customer who cannot tell
             * which will assume the app is broken.
             */
            <GlassPanel className="mt-4 border-dashed p-8 text-center">
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
            </GlassPanel>
          )}
        </section>

        <section aria-labelledby="checkin-heading" className="mt-10">
          <h2
            id="checkin-heading"
            className="type-meta font-semibold text-muted-foreground"
          >
            Check in
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            {checkIn
              ? "You checked in today. You can update it any time."
              : "Takes about half a minute. Checking in to say you did not practise still counts."}
          </p>
          <CheckInForm existing={checkIn} />
        </section>
      </main>

      <MobileTabBar role={session.role} currentPath="/today" />
    </div>
  );
}

