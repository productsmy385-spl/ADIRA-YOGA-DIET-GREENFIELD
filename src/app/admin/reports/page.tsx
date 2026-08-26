import type { Metadata } from "next";
import { FileText } from "lucide-react";

import { AppNav, MobileTabBar } from "@/components/nav/app-nav";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/server/auth/guards";
import { listOrganizationReports } from "@/server/repositories/reports";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

/**
 * ORGANISATION-level reports.
 *
 * `listOrganizationReports` filters on `customer_id IS NULL`, so this page shows aggregates
 * that belong to nobody in particular. That is why an admin may read it without an
 * assignment (ADR-013).
 *
 * A member's own report is member data. It is reached through that member's page, behind
 * `resolveMemberAccess`, and deliberately not listed here.
 */
export default async function AdminReportsPage() {
  const session = await requireRole("ADMIN", "TRAINER", "STAFF");
  const reports = await listOrganizationReports(session.organizationId);

  return (
    <div className="min-h-dvh bg-background">
      <AppNav role={session.role} currentPath="/admin/reports" />

      <main className="mx-auto max-w-3xl px-6 py-10 pb-28 sm:pb-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Organisation-wide summaries for {session.organizationName}.
        </p>

        {reports.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
            <FileText className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-4 text-sm/relaxed text-muted-foreground">
              No organisation reports yet. Generation runs on the job queue, which is not
              switched on — see roadmap Phase 11.
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

        <p className="mt-6 text-xs/relaxed text-muted-foreground">
          A member&rsquo;s own report is member data and appears on their page, which needs
          an assignment.
        </p>
      </main>

      <MobileTabBar role={session.role} currentPath="/admin/reports" />
    </div>
  );
}
