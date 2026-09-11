import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CircleCheck,
  Clock,
  Download,
  FileUp,
  Info,
  KeyRound,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";

import { AppNav, MobileTabBar } from "@/components/nav/app-nav";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PageShell, StatRow, StatTile } from "@/components/ui/page-shell";
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

/**
 * Tint per status — reinforcement, never the message.
 *
 * Green reads "in good standing", blue "waiting on someone", red "blocked". The label is
 * always rendered alongside, so nothing here is the only carrier of the state: the rule
 * this file already followed with `variant="secondary"` and which the colour must not
 * quietly break.
 */
const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-accent-green/14 text-accent-green-ink",
  INVITED: "bg-accent-blue/14 text-accent-blue-ink",
  PENDING: "bg-accent-cyan/16 text-accent-cyan-ink",
  SUSPENDED: "bg-accent-red/12 text-accent-red-ink",
  LOCKED: "bg-accent-red/12 text-accent-red-ink",
  DISABLED: "bg-muted text-foreground/60",
};

export default async function MembersPage() {
  const session = await requireRole("ADMIN");
  const members = await listMembers(session.organizationId, { kind: "MEMBERS" });

  /*
   * Counts derived from the rows already fetched — no extra query, and deliberately no
   * new repository call. `listMembers` selects identity, role, status and an assignment
   * COUNT; summing what is already here adds no data this page was not already allowed
   * to show. A "practising this week" tile would need activity data and would quietly
   * turn an administration screen into a health-record summary.
   */
  const activeCount = members.filter((m) => m.status === "ACTIVE").length;
  const pendingCount = members.filter(
    (m) => m.status === "INVITED" || m.status === "PENDING",
  ).length;
  const assignedCount = members.filter((m) => m.assignmentCount > 0).length;

  return (
    <div className="theme-bg-wrapper app-shell">
      <AppNav role={session.role} currentPath="/admin/members" />

      <PageShell env="env-members" width="wide">
        <PageHeader
          eyebrow="Administration"
          title="Members"
          description={`Everyone in ${session.organizationName}. Administration only — open a member to see their practice, which needs an assignment.`}
        >
          {/*
            The colour hierarchy, and it is a hierarchy rather than decoration: ONE green
            action per view. Adding a member is the thing this page exists to do; import
            and export are the ways to do it in bulk, so they take the informational blue
            and the environmental cyan rather than competing for the same emphasis.
          */}
          <Button asChild size="sm" variant="success">
            <Link href="/admin/members/new">
              <UserPlus aria-hidden />
              Add member
            </Link>
          </Button>
          <Button asChild size="sm" variant="info">
            <Link href="/admin/members/import">
              <FileUp aria-hidden />
              Import CSV
            </Link>
          </Button>
          {members.length > 0 ? (
            <Button asChild size="sm" variant="brand">
              <a href="/api/members/export">
                <Download aria-hidden />
                Export CSV
              </a>
            </Button>
          ) : null}
        </PageHeader>

        {members.length > 0 ? (
          <StatRow>
            <StatTile
              tone="green"
              label="Total members"
              value={members.length}
              hint="In this organisation"
              icon={<Users />}
            />
            <StatTile
              tone="blue"
              label="Active"
              value={activeCount}
              hint="Signed in and practising"
              icon={<CircleCheck />}
            />
            <StatTile
              tone="orange"
              label="Pending"
              value={pendingCount}
              hint="Invited, not yet active"
              icon={<Clock />}
            />
            <StatTile
              tone="violet"
              label="Assigned"
              value={assignedCount}
              hint="Have a consultant"
              icon={<UserCheck />}
            />
          </StatRow>
        ) : null}

        {members.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-accent-cyan/40 bg-surface-glass p-10 text-center backdrop-blur-glass">
            <span
              aria-hidden
              className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent-cyan/14 text-accent-cyan-ink"
            >
              <Users className="size-7" />
            </span>
            <p className="mt-4 text-sm/relaxed text-foreground/70">
              No members yet. Add someone, import a CSV, or approve an access request.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button asChild size="sm" variant="success">
                <Link href="/admin/members/new">
                  <UserPlus aria-hidden />
                  Add a member
                </Link>
              </Button>
              <Button asChild size="sm" variant="info">
                <Link href="/admin/access-requests">
                  <KeyRound aria-hidden />
                  Review access requests
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-8 overflow-x-auto rounded-2xl border border-border-glass bg-surface-glass-strong shadow-sm backdrop-blur-glass">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Members of {session.organizationName}, with role, status and how many admins
                each is assigned to
              </caption>
              <thead className="border-b border-border-glass bg-accent-cyan/8">
                <tr>
                  <th scope="col" className="px-5 py-3.5 text-left font-bold text-foreground">Name</th>
                  <th scope="col" className="px-5 py-3.5 text-left font-bold text-foreground">Email</th>
                  <th scope="col" className="px-5 py-3.5 text-left font-bold text-foreground">Status</th>
                  <th scope="col" className="px-5 py-3.5 text-left font-bold text-foreground">Assigned to</th>
                  <th scope="col" className="px-5 py-3.5 text-right font-bold text-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-glass">
                {members.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-accent-cyan/6">
                    <td className="px-5 py-3.5 font-semibold text-foreground">
                      {m.fullName}
                    </td>
                    <td className="px-5 py-3.5 text-foreground/70">{m.email}</td>
                    <td className="px-5 py-3.5">
                      {/*
                        The WORD carries the status; the tint only reinforces it. Colour is
                        never the sole carrier — someone who cannot distinguish these hues
                        still reads "Suspended", which is the whole point of keeping the
                        label rather than shrinking it to a dot.
                      */}
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[m.status] ?? "bg-muted text-foreground/70"}`}
                      >
                        {STATUS_LABEL[m.status] ?? m.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 tabular-nums text-foreground/70">
                      {m.assignmentCount === 0 ? (
                        <span className="text-foreground/50">nobody</span>
                      ) : (
                        `${m.assignmentCount} admin${m.assignmentCount === 1 ? "" : "s"}`
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Button asChild size="sm" variant="glass">
                        <Link href={`/admin/customers/${m.id}`}>
                          Open
                          <ArrowRight aria-hidden />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* The permission rule, given a tinted panel rather than left as grey small print —
            it is the one thing on this page an administrator most needs to have read. */}
        <div className="mt-6 flex gap-3 rounded-2xl border border-accent-blue/25 bg-accent-blue/8 p-4">
          <Info className="mt-0.5 size-5 shrink-0 text-accent-blue-ink" aria-hidden />
          <p className="text-sm/relaxed text-foreground/80">
            Opening a member shows their practice only if they are assigned to you. That is
            deliberate: administering an account and reading someone&rsquo;s health record are
            different permissions.
          </p>
        </div>
      </PageShell>

      <MobileTabBar role={session.role} currentPath="/admin/members" />
    </div>
  );
}
