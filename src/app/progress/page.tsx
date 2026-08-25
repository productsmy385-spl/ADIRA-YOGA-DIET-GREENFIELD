import type { Metadata } from "next";
import { TrendingUp } from "lucide-react";

import { AppNav, MobileTabBar } from "@/components/nav/app-nav";
import { requireTenantSession } from "@/server/auth/guards";
import { listStatusesInRange, organizationToday } from "@/server/repositories/activities";
import { listCheckInsInRange } from "@/server/repositories/checkins";
import { completionPercent, tally } from "@/server/services/metrics";

export const metadata: Metadata = { title: "Progress" };
export const dynamic = "force-dynamic";

/**
 * A member's own progress.
 *
 * Every figure is computed from that member's rows, scoped by the session — there is no id
 * in this route, so there is nothing to tamper with (ADR-004).
 *
 * WHAT THIS PAGE REFUSES TO DO
 *
 * It does not render 0% when nothing was scheduled. `completionPercent` returns null for
 * that case precisely so "no data" and "total failure" stay distinguishable, and the
 * distinction is preserved all the way to the screen — a member who was given no plan
 * seeing "0% adherence" would be told they had failed at something nobody asked of them.
 *
 * It also makes no clinical claim. Counts of completed and missed activities are facts the
 * database holds; what they mean for someone's health is not this page's to say (ADR-013 Q6).
 */

/** `YYYY-MM-DD`, `days` before `from`. Dates are handled as strings to avoid drifting
 *  across the organisation's timezone boundary, which `organizationToday` already resolved. */
function shiftDate(from: string, days: number): string {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface Window {
  label: string;
  days: number;
}

const WINDOWS: Window[] = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
];

export default async function ProgressPage() {
  const session = await requireTenantSession();
  const today = await organizationToday(session.organizationId);

  const periods = await Promise.all(
    WINDOWS.map(async (w) => {
      const from = shiftDate(today, -(w.days - 1));
      const [statuses, checkIns] = await Promise.all([
        listStatusesInRange(session.organizationId, session.userId, from, today),
        listCheckInsInRange(session.organizationId, session.userId, from, today),
      ]);

      const counts = tally(statuses);
      return {
        ...w,
        counts,
        percent: completionPercent(counts),
        scheduled: statuses.length,
        checkIns: checkIns.length,
      };
    }),
  );

  const recentCheckIns = await listCheckInsInRange(
    session.organizationId,
    session.userId,
    shiftDate(today, -13),
    today,
  );

  return (
    <div className="min-h-dvh bg-background">
      <AppNav role={session.role} currentPath="/progress" />

      <main className="mx-auto max-w-3xl px-6 py-10 pb-28 sm:pb-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Progress</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Counted from what you actually completed.
        </p>

        <section aria-labelledby="adherence-heading" className="mt-8">
          <h2
            id="adherence-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Adherence
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {periods.map((p) => (
              <div key={p.label} className="rounded-xl border border-border bg-card p-5">
                <p className="text-sm text-muted-foreground">{p.label}</p>

                {p.scheduled === 0 ? (
                  <>
                    <p className="mt-2 text-3xl font-semibold text-muted-foreground">—</p>
                    <p className="mt-2 text-sm/relaxed text-muted-foreground">
                      Nothing was scheduled in this period, so there is no adherence to
                      report.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-3xl font-semibold tabular-nums text-card-foreground">
                      {p.percent === null ? "—" : `${p.percent}%`}
                    </p>
                    <div
                      className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={p.percent ?? 0}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${p.label} adherence`}
                    >
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${p.percent ?? 0}%` }}
                      />
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">Completed</dt>
                        <dd className="tabular-nums text-card-foreground">
                          {p.counts.completed}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Missed</dt>
                        <dd className="tabular-nums text-card-foreground">
                          {p.counts.missed}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Skipped</dt>
                        <dd className="tabular-nums text-card-foreground">
                          {p.counts.skipped}
                        </dd>
                      </div>
                    </dl>
                  </>
                )}

                <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                  {p.checkIns} check-in{p.checkIns === 1 ? "" : "s"} recorded
                </p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="checkins-heading" className="mt-10">
          <h2
            id="checkins-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Recent check-ins
          </h2>

          {recentCheckIns.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center">
              <TrendingUp className="mx-auto size-7 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-sm text-muted-foreground">
                No check-ins in the last fortnight. Record one from Today.
              </p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <caption className="sr-only">Your check-ins over the last fortnight</caption>
                <thead className="bg-muted/50">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-left font-medium">Date</th>
                    <th scope="col" className="px-4 py-2 text-left font-medium">Mood</th>
                    <th scope="col" className="px-4 py-2 text-left font-medium">Sleep</th>
                    <th scope="col" className="px-4 py-2 text-left font-medium">Water</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentCheckIns.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2 whitespace-nowrap text-card-foreground">
                        {c.checkinDate}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">
                        {c.mood ?? "—"}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">
                        {c.sleepMinutes === null
                          ? "—"
                          : `${Math.floor(c.sleepMinutes / 60)}h ${c.sleepMinutes % 60}m`}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">
                        {c.waterGlasses ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <MobileTabBar role={session.role} currentPath="/progress" />
    </div>
  );
}
