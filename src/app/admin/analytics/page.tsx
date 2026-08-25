import type { Metadata } from "next";
import Link from "next/link";

import { AppNav } from "@/components/nav/app-nav";
import { requireRole } from "@/server/auth/guards";
import { consultantLoads, organizationSummary } from "@/server/repositories/analytics";

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

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs tracking-widest text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-card-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default async function AnalyticsPage() {
  const session = await requireRole("ADMIN");

  const [summary, consultants] = await Promise.all([
    organizationSummary(session.organizationId),
    consultantLoads(session.organizationId),
  ]);

  return (
    <div className="min-h-dvh bg-background">
      <AppNav role={session.role} currentPath="/admin/analytics" />

      <main className="mx-auto max-w-3xl px-6 py-10 pb-28 sm:pb-10">
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Caseload
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {session.organizationName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything below is counted from records, over the last 7 days unless stated.
        </p>

        <section aria-label="Organisation" className="mt-8 grid gap-3 sm:grid-cols-3">
          <Stat
            label="Customers"
            value={String(summary.totalCustomers)}
            hint={`${summary.newCustomers30d} joined in 30 days`}
          />
          <Stat
            label="Active"
            value={String(summary.activeCustomers)}
            hint="a live plan and recent engagement"
          />
          <Stat label="Consultants" value={String(summary.consultants)} />
          <Stat
            label="Adherence"
            value={percent(summary.adherence7d)}
            hint="self-reported"
          />
          <Stat label="Check-ins" value={String(summary.checkIns7d)} />
        </section>

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
                        {percent(consultant.assignedAdherence7d)}
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
      </main>
    </div>
  );
}
