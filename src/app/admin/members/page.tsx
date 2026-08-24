import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus, Users } from "lucide-react";

import { AppNav } from "@/components/nav/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    <div className="min-h-dvh bg-background">
      <AppNav role={session.role} currentPath="/admin/members" />

      <main className="mx-auto max-w-4xl px-6 py-10 pb-28 sm:pb-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Members</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Everyone in {session.organizationName}. Administration only — open a member to
              see their practice, which needs an assignment.
            </p>
          </div>

          <Button asChild size="sm" variant="outline">
            <Link href="/admin/members/import">
              <UserPlus aria-hidden />
              Import CSV
            </Link>
          </Button>
        </div>

        {members.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
            <Users className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-4 text-sm text-muted-foreground">
              No members yet. Approve an access request, or import a CSV.
            </p>
            <Button asChild size="sm" className="mt-5">
              <Link href="/admin/access-requests">Review access requests</Link>
            </Button>
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
    </div>
  );
}
