import type { Metadata } from "next";
import Link from "next/link";

import { AppNav } from "@/components/nav/app-nav";
import { requireRole } from "@/server/auth/guards";
import { consultantLoads, organizationSummary } from "@/server/repositories/analytics";
import { Activity, CalendarCheck, CalendarClock, Target, UserCog, Users } from "lucide-react";
import { sessionStats } from "@/server/repositories/yoga-sessions";

import { MetricCard, MetricGrid } from "@/components/ui/metric";
import { PageShell } from "@/components/ui/page-shell";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

/**
 * The organisation owner's weekly review (USER-JOURNEYS J5).
 *
 * ORG_OWNER only. An ADMIN is assignment-scoped (ADR-002) and has no business seeing
 * organisation-wide figures — those aggregate customers they cannot open individually,
 * which would be the tenancy rule leaking through a summary.
 *
 * THE LABELLING HERE IS THE FEATURE.
 *
 * J5 and R5 both name the same failure: a consultant given the hardest customers shows
 * the worst adherence, and calling that "performance" is wrong and organisationally
 * corrosive. So the column says "adherence of assigned customers", caseload sits beside
 * it, and the page states plainly that it is not a quality ranking. A number this easy
 * to misread needs its caveat on the same screen, not in a document.
 */

/** `null` stays `null`, so MetricCard renders "not available" rather than a fake 0%. */
function percent(value: number | null): string | null {
  return value === null ? null : `${Math.round(value * 100)}%`;
}

export default async function AnalyticsPage() {
  const session = await requireRole("ADMIN", "TEAM_MANAGER");

  const [summary, consultants, sessions] = await Promise.all([
    organizationSummary(session.organizationId),
    consultantLoads(session.organizationId),
    // Counts only — nobody named (brief §7 yoga analytics).
    sessionStats(session.organizationId, 30),
  ]);

  return (
    <div className="theme-bg-wrapper theme-fresh-green app-shell">
      <AppNav role={session.role} currentPath="/admin/analytics" />

      <PageShell env="env-analytics" width="narrow">
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Caseload
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {session.organizationName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything below is counted from records, over the last 7 days unless stated.
        </p>

        <MetricGrid label="Organisation" columns={5} className="mt-8">
          <MetricCard
            label="Members"
            value={summary.totalCustomers}
            icon={<Users />}
            tone="green"
            description={`${summary.newCustomers30d} joined in 30 days`}
          />
          <MetricCard
            label="Active members"
            value={summary.activeCustomers}
            icon={<Activity />}
            tone="blue"
            description="A live plan and recent engagement"
          />
          <MetricCard
            label="Practitioners"
            value={summary.consultants}
            icon={<UserCog />}
            tone="turquoise"
            description="Team members who can hold a caseload"
          />
          <MetricCard
            label="Adherence"
            value={percent(summary.adherence7d)}
            icon={<Target />}
            tone="violet"
            description="Self-reported, 7 days"
          />
          <MetricCard
            label="Check-ins"
            value={summary.checkIns7d}
            icon={<CalendarCheck />}
            tone="orange"
            description="Last 7 days"
          />
        </MetricGrid>

        <MetricGrid label="Yoga sessions" columns={3} className="mt-5">
          <MetricCard label="Sessions completed" value={sessions.completed} icon={<CalendarCheck />} tone="green" description="Last 30 days" />
          <MetricCard label="Sessions scheduled" value={sessions.scheduled} icon={<CalendarClock />} tone="blue" description="Next 30 days" />
          <MetricCard
            label="Session attendance"
            value={sessions.marked === 0 ? null : `${Math.round((sessions.attended / sessions.marked) * 100)}%`}
            icon={<Users />}
            tone="violet"
            description="Of attendance marked, last 30 days"
          />
        </MetricGrid>

        <section aria-labelledby="consultants-heading" className="mt-12">
          <h2
            id="consultants-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Consultants
          </h2>

          {consultants.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-md border-collapse overflow-hidden rounded-lg border border-border bg-card text-sm">
                <caption className="sr-only">
                  Each consultant&rsquo;s caseload and the adherence of the customers
                  assigned to them
                </caption>
                <thead>
                  <tr className="border-b border-border text-left">
                    <th scope="col" className="px-5 py-3 font-medium text-muted-foreground">
                      Consultant
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium text-muted-foreground">
                      Caseload
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium text-muted-foreground">
                      {/* NOT "performance". See the note at the top of this file. */}
                      Adherence of assigned customers
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {consultants.map((consultant) => (
                    <tr key={consultant.consultantId} className="border-b border-border last:border-0">
                      <th scope="row" className="px-5 py-3 text-left font-normal text-card-foreground">
                        {consultant.fullName}
                      </th>
                      <td className="px-5 py-3 text-card-foreground">
                        {consultant.caseload}
                      </td>
                      <td className="px-5 py-3 text-card-foreground">
                        {percent(consultant.assignedAdherence7d) ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No consultants yet.</p>
          )}

          <p className="mt-4 rounded-lg border border-border bg-secondary/40 p-4 text-xs/relaxed text-muted-foreground">
            This is <strong className="font-medium text-foreground">not</strong> a ranking
            of consultants. A consultant working with the most difficult customers will
            show the lowest adherence, which is why caseload is shown beside it. Adherence
            is self-reported by customers, and a dash means nothing was scheduled — not
            that nothing was done.
          </p>
        </section>
      </PageShell>
    </div>
  );
}
