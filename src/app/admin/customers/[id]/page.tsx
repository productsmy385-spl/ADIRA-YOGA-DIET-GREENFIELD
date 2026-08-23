import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { branding } from "@/lib/branding";
import { requireRole } from "@/server/auth/guards";
import {
  listActivitiesForDate,
  listStatusesInRange,
  organizationToday,
} from "@/server/repositories/activities";
import { listAssignmentsForCustomer } from "@/server/repositories/assignments";
import { recordAudit } from "@/server/repositories/audit-logs";
import {
  actorFromSession,
  resolveMemberAccessAudited,
} from "@/server/authorization/member-access";
import { listCheckInsInRange } from "@/server/repositories/checkins";
import { findUserById } from "@/server/repositories/users";
import { completionPercent, tally } from "@/server/services/metrics";

export const metadata: Metadata = { title: "Customer" };
export const dynamic = "force-dynamic";

/**
 * One customer's record, for the consultant who serves them.
 *
 * AUTHORIZATION HAPPENS BEFORE ANY DATA IS READ.
 *
 * `canViewCustomer` is asked first, and a refusal returns `notFound()` — the same
 * response as a customer who does not exist. That equivalence is deliberate: a 403 that
 * is distinguishable from a 404 confirms the record exists, which turns this URL into an
 * oracle for enumerating another consultant's caseload.
 *
 * Reading first and filtering afterwards would also be wrong even with the same
 * response, because the row would have been retrieved — and a later logging change or
 * error path could surface it.
 */

function subtractDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireRole("ADMIN");

  // One gate for every member-sensitive read (ADR-013). It performs the assignment
  // lookup and writes the DENIED audit entry itself, so no call site can forget either.
  const { decision } = await resolveMemberAccessAudited(
    actorFromSession(session),
    id,
    "customer.view",
  );

  const permitted = decision.allowed;

  if (!permitted) {
    // Recorded as DENIED, which is the signal worth watching: a consultant reaching for
    // a customer outside their caseload is either a bug or a probe.
    await recordAudit({
      organizationId: session.organizationId,
      actorDomain: "TENANT",
      actorId: session.userId,
      actorLabel: session.email,
      action: "customer.view",
      resourceType: "user",
      resourceId: id,
      outcome: "DENIED",
    });
    notFound();
  }

  const customer = await findUserById(id, session.organizationId);
  if (!customer) notFound();

  const today = await organizationToday(session.organizationId);
  const weekAgo = subtractDays(today, 6);

  const [assignments, todayActivities, weekStatuses, checkIns] = await Promise.all([
    listAssignmentsForCustomer(session.organizationId, id),
    listActivitiesForDate(session.organizationId, id, today),
    listStatusesInRange(session.organizationId, id, weekAgo, today),
    listCheckInsInRange(session.organizationId, id, weekAgo, today),
  ]);

  const weekPercent = completionPercent(tally(weekStatuses));
  const livePlan = assignments.find((a) => a.status === "ACTIVE");

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: "customer.view",
    resourceType: "user",
    resourceId: id,
    outcome: "SUCCESS",
  });

  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- static mark */}
        <img src={branding.icons.mark} alt="" aria-hidden className="size-8" />
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Caseload
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-24">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {customer.fullName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {customer.email} · {customer.status.toLowerCase()}
        </p>

        <section aria-label="Summary" className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs tracking-widest text-muted-foreground uppercase">
              Adherence · 7 days
            </p>
            <p className="mt-1 text-2xl font-semibold text-card-foreground">
              {weekPercent === null ? "—" : `${weekPercent}%`}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs tracking-widest text-muted-foreground uppercase">
              Check-ins · 7 days
            </p>
            <p className="mt-1 text-2xl font-semibold text-card-foreground">
              {checkIns.length}
            </p>
          </div>
        </section>

        <section aria-labelledby="plan-heading" className="mt-10">
          <h2
            id="plan-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Programme
          </h2>
          {livePlan ? (
            <div className="mt-3 rounded-lg border border-border bg-card p-5">
              <p className="font-medium text-card-foreground">{livePlan.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {livePlan.kind === "YOGA" ? "Yoga" : "Diet"} · started{" "}
                {livePlan.startsOn} · {livePlan.durationWeeks} weeks
              </p>
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
              No active programme.
            </p>
          )}
        </section>

        <section aria-labelledby="today-heading" className="mt-10">
          <h2
            id="today-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Today
          </h2>
          {todayActivities.length > 0 ? (
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {todayActivities.map((activity) => (
                <li
                  key={activity.id}
                  className="flex items-center justify-between gap-4 px-5 py-3.5"
                >
                  <span className="text-sm text-card-foreground">{activity.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {activity.status.toLowerCase().replace("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Nothing scheduled for today.
            </p>
          )}
        </section>

        <section aria-labelledby="checkins-heading" className="mt-10">
          <h2
            id="checkins-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Recent check-ins
          </h2>
          {checkIns.length > 0 ? (
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {[...checkIns].reverse().map((checkIn) => (
                <li key={checkIn.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-card-foreground">
                      {checkIn.checkinDate}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      mood {checkIn.mood ?? "—"} · sleep {checkIn.sleepQuality ?? "—"} ·
                      water {checkIn.waterGlasses ?? "—"}
                    </span>
                  </div>
                  {checkIn.notes && (
                    <p className="mt-1.5 text-sm text-muted-foreground">{checkIn.notes}</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No check-ins in the last 7 days.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
