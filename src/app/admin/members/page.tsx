import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileUp, UserPlus, Users } from "lucide-react";

import { AppNav, MobileTabBar } from "@/components/nav/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/server/auth/guards";
import { listMembers } from "@/server/repositories/members";

export const metadata: Metadata = { title: "Members" };
export const dynamic = "force-dynamic";

/**
 * Organisation-wide member ADMINISTRATION.
 *
 * This is the half of ADR-013 that is deliberately org-wide: an admin may administer every
 * member without an assignment. It is therefore the one member listing in the product with
 * no assignment filter, and the one most at risk of quietly becoming a health-data leak.
 *
 * WHAT IS NOT ON THIS PAGE, AND MUST NOT BE
 *
 * No adherence, no activity counts, no check-ins, no attention flags. `listMembers` selects
 * identity, role, status and an assignment COUNT — a number, never who or what they see.
 * Adding a "compliance" column here would hand every admin a summary of every member's
 * practice while every other control in the system still looked correct.
 *
 * Health data is reached one member at a time, through `/admin/customers/[id]`, which goes
 * via `resolveMemberAccess` and requires an assignment.
 */

const STATUS_LABEL: Record<string, string> = {
  INVITED: "Invited",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  LOCKED: "Locked",
  DISABLED: "Deactivated",
  PENDING: "Pending",
};

export default async function MembersPage() {
  const session = await requireRole("ADMIN");
  const members = await listMembers(session.organizationId, { kind: "MEMBERS" });

  return (
    <div className="theme-bg-wrapper theme-blue-calm min-h-dvh bg-background sm:pl-[260px] pt-14 sm:pt-0">
      <AppNav role={session.role} currentPath="/admin/members" />

      <main className="mx-auto max-w-4xl px-6 py-10 pb-28 sm:pb-10">
        <PageHeader
          title="Members"
          description={`Everyone in ${session.organizationName}. Administration only — open a member to see their practice, which needs an assignment.`}
        >
          <Button asChild size="sm">
            <Link href="/admin/members/new">
              <UserPlus aria-hidden />
              Add member
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/members/import">
              <FileUp aria-hidden />
              Import CSV
            </Link>
          </Button>
          {members.length > 0 ? (
            <Button asChild size="sm" variant="outline">
              <a href="/api/members/export">
                <Download aria-hidden />
                Export CSV
              </a>
            </Button>
          ) : null}
        </PageHeader>

        {members.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
            <Users className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-4 text-sm text-muted-foreground">
              No members yet. Add someone, import a CSV, or approve an access request.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button asChild size="sm">
                <Link href="/admin/members/new">Add a member</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/access-requests">Review access requests</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-8 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Members of {session.organizationName}, with role, status and how many admins
                each is assigned to
              </caption>
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Name</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Email</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Assigned to</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((m) => (
                  <tr key={m.id} className="bg-card">
                    <td className="px-4 py-3 font-medium text-card-foreground">
                      {m.fullName}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{m.email}</td>
                    <td className="px-4 py-3">
                      {/* Word, not colour — status is never conveyed by colour alone. */}
                      <Badge variant={m.status === "ACTIVE" ? "secondary" : "outline"}>
                        {STATUS_LABEL[m.status] ?? m.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {m.assignmentCount === 0 ? (
                        <span className="text-muted-foreground">nobody</span>
                      ) : (
                        `${m.assignmentCount} admin${m.assignmentCount === 1 ? "" : "s"}`
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button asChild size="xs" variant="ghost">
                        <Link href={`/admin/customers/${m.id}`}>Open</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-6 text-xs/relaxed text-muted-foreground">
          Opening a member shows their practice only if they are assigned to you. That is
          deliberate: administering an account and reading someone&rsquo;s health record are
          different permissions.
        </p>
      </main>

      <MobileTabBar role={session.role} currentPath="/admin/members" />
    </div>
  );
}
