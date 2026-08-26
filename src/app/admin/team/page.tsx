import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus, Users } from "lucide-react";

import { AppNav, MobileTabBar } from "@/components/nav/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/server/auth/guards";
import { listMembers } from "@/server/repositories/members";

export const metadata: Metadata = { title: "Team" };
export const dynamic = "force-dynamic";

/**
 * The organisation's staff — administrators, trainers and support staff.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS PAGE EXISTS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Migration 011 gave an ADMIN the ability to create TRAINER and STAFF accounts, and the
 * add-member form offers all three roles. Nothing listed them. `/admin/members` filters to
 * `kind: "MEMBERS"` — people receiving care — so a newly invited trainer vanished the
 * moment they were created: unfindable, unauditable, and impossible to tell apart from an
 * invitation that had silently failed.
 *
 * That is the same create-with-no-listing shape that made `takeIntoCaseloadAction` and
 * `createOrganizationAction` unreachable earlier in this project. A role the roster cannot
 * show is a role nobody can manage.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE SAME LINE `/admin/members` DRAWS, FOR THE SAME REASON
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This is ADMINISTRATION, so it is organisation-wide and shows identity, role and status.
 * It shows NO member health data — no adherence, no activity, no check-ins — and it must
 * not start to. What it does show that `/admin/members` cannot is the reverse relationship:
 * how many members each person carries, which is a count of assignments, never who they
 * are.
 *
 * `listMembers` selects that count in SQL and returns no member identity with it.
 */

const STATUS_LABEL: Record<string, string> = {
  INVITED: "Invited",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  LOCKED: "Locked",
  DISABLED: "Deactivated",
  PENDING: "Pending",
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrator",
  ORG_OWNER: "Administrator",
  TRAINER: "Trainer",
  STAFF: "Staff",
};

const ROLE_BLURB: Record<string, string> = {
  ADMIN: "Administers the organisation. Reads a member's practice only when assigned.",
  ORG_OWNER: "Administers the organisation. Reads a member's practice only when assigned.",
  TRAINER: "Builds programmes and prescribes them to the members assigned to them.",
  STAFF: "Follows and messages the members assigned to them. Authors nothing.",
};

export default async function TeamPage() {
  const session = await requireRole("ADMIN");

  const team = await listMembers(session.organizationId, { kind: "STAFF" });

  const trainers = team.filter((t) => t.role === "TRAINER").length;
  const staff = team.filter((t) => t.role === "STAFF").length;
  const invited = team.filter((t) => t.status === "INVITED").length;

  return (
    <div className="min-h-dvh bg-background">
      <AppNav role={session.role} currentPath="/admin/team" />

      <main className="mx-auto max-w-4xl px-6 py-10 pb-28 sm:pb-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Team</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Everyone who delivers care at {session.organizationName} —{" "}
              {trainers} trainer{trainers === 1 ? "" : "s"} and {staff} staff.
            </p>
          </div>

          <Button asChild size="sm">
            <Link href="/admin/members/new">
              <UserPlus aria-hidden />
              Add someone
            </Link>
          </Button>
        </div>

        {invited > 0 && (
          <p
            role="status"
            className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground"
          >
            {invited} {invited === 1 ? "person has" : "people have"} not signed in yet. An
            invited account cannot hold a session until they verify their address — nothing
            is activated from here.
          </p>
        )}

        {team.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
            <Users className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-4 text-sm/relaxed text-muted-foreground">
              Nobody on the team yet. Add a trainer to build and prescribe programmes, or
              staff to follow a caseload.
            </p>
            <Button asChild size="sm" className="mt-5">
              <Link href="/admin/members/new">Add someone</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-8 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-3xl text-sm">
              <caption className="sr-only">
                Administrators, trainers and staff at {session.organizationName}, with role,
                status, and how many members each carries
              </caption>
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Name</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Email</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Role</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Caseload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {team.map((person) => (
                  <tr key={person.id} className="bg-card">
                    <th
                      scope="row"
                      className="px-4 py-3 text-left font-medium text-card-foreground"
                    >
                      {person.fullName}
                      {person.id === session.userId && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          you
                        </span>
                      )}
                    </th>
                    <td className="px-4 py-3 text-muted-foreground">{person.email}</td>
                    <td className="px-4 py-3">
                      <span className="text-card-foreground">
                        {ROLE_LABEL[person.role] ?? person.role}
                      </span>
                      <span className="type-meta mt-0.5 block max-w-xs text-muted-foreground">
                        {ROLE_BLURB[person.role] ?? ""}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {/* Word, not colour — status is never conveyed by colour alone. */}
                      <Badge variant={person.status === "ACTIVE" ? "secondary" : "outline"}>
                        {STATUS_LABEL[person.status] ?? person.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {/*
                        A COUNT, never a list. Who is on somebody else's caseload is member
                        data and belongs behind `resolveMemberAccess`; how many they carry
                        is an administrative fact about workload.
                      */}
                      {person.assignmentCount === 0
                        ? "nobody"
                        : `${person.assignmentCount} member${person.assignmentCount === 1 ? "" : "s"}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-6 text-xs/relaxed text-muted-foreground">
          Roles are set when the account is created. A trainer or staff member reads a
          member&rsquo;s practice only where an assignment exists — being on the team grants
          no reach on its own.
        </p>
      </main>

      <MobileTabBar role={session.role} currentPath="/admin/team" />
    </div>
  );
}
