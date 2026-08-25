import type { Metadata } from "next";
import { FileText } from "lucide-react";

import { AppNav, MobileTabBar } from "@/components/nav/app-nav";
import { Badge } from "@/components/ui/badge";
import { requireTenantSession } from "@/server/auth/guards";
import { listReportsForMember } from "@/server/repositories/reports";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

/**
 * A member's own reports.
 *
 * Identity comes from the session; there is no id in this route. A report's figures are
 * whatever was frozen at generation time — this page renders them and computes nothing, so
 * last week's numbers cannot move because something changed since.
 *
 * Generation is roadmap Phase 11 and is not built, so this list is genuinely empty rather
 * than filled with a plausible sample. The empty state says which, because "no reports yet"
 * and "reports are not built" are different facts and the reader deserves the real one.
 */
export default async function ReportsPage() {
  const session = await requireTenantSession();
  const reports = await listReportsForMember(session.organizationId, session.userId);

  return (
    <div className="min-h-dvh bg-background">
      <AppNav role={session.role} currentPath="/reports" />

      <main className="mx-auto max-w-2xl px-6 py-10 pb-28 sm:pb-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Summaries of periods that have closed.
        </p>

        {reports.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
            <FileText className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-4 text-sm/relaxed text-muted-foreground">
              No reports yet. Weekly summaries are generated once report generation is
              switched on for your organisation.
            </p>
          </div>
        ) : (
          <ul className="mt-8 space-y-3">
            {reports.map((r) => (
              <li key={r.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-medium text-card-foreground">
                    {r.periodStart} — {r.periodEnd}
                  </h2>
                  <Badge variant={r.status === "READY" ? "secondary" : "outline"}>
                    {r.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{r.kind}</p>
              </li>
            ))}
          </ul>
        )}
      </main>

      <MobileTabBar role={session.role} currentPath="/reports" />
    </div>
  );
}
