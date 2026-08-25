import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarPlus,
  ClipboardList,
  Inbox,
  Salad,
  UserPlus,
} from "lucide-react";

import { AppNav } from "@/components/nav/app-nav";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/server/auth/guards";
import { countPendingAccessRequests } from "@/server/repositories/access-requests";
import { listCaseload, type CaseloadEntry } from "@/server/repositories/caseload";
import { listMembers } from "@/server/repositories/members";
import { listProgrammes } from "@/server/repositories/programmes";
import { actorFromSession } from "@/server/authorization/member-access";
import type { AttentionSignal } from "@/server/services/metrics";

export const metadata: Metadata = { title: "Caseload" };
export const dynamic = "force-dynamic";

/**
 * The consultant's morning triage (USER-JOURNEYS J3).
 *
 * THIS PAGE OPENS ON EXCEPTIONS, NOT TOTALS.
 *
 * "You have 32 customers" is not actionable. "4 customers missed three or more sessions
 * this week" is. J3 identifies this as the difference between a consultant carrying a
 * larger caseload and a consultant drowning, so the customers needing attention come
 * first and carry the reason — never an unranked table sorted by name.
 *
 * Reach is decided in the query (ADR-002): an `ADMIN` sees only their assigned
 * customers, an `ORG_OWNER` sees the organisation. Unassigned customers are not fetched
 * and filtered — they are never selected.
 */

const SIGNAL_TEXT: Record<AttentionSignal, string> = {
  CONSULTANT_FLAGGED: "Flagged for review",
  NEVER_STARTED: "Has not started",
  SUSTAINED_ABSENCE: "No activity for several days",
  ADHERENCE_COLLAPSE: "Adherence has dropped sharply",
  REPEATED_MISSES: "Several missed sessions",
  WELLBEING_DECLINE: "Reporting low mood or sleep",
};

/** Rate as a percentage, or an em dash. Never 0% for "no data" (docs/METRICS.md). */
function rate(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function CustomerRow({ entry }: { entry: CaseloadEntry }) {
  const primary = entry.attention.primary;

  return (
    <li>
      <Link
        href={`/admin/customers/${entry.customerId}`}
        className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-secondary/60"
      >
        <div className="min-w-0">
          <p className="font-medium text-card-foreground">{entry.fullName}</p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {primary
              ? SIGNAL_TEXT[primary]
              : (entry.planName ?? "No programme assigned")}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm font-medium text-card-foreground">
            {rate(entry.currentRate)}
          </p>
          <p className="text-xs text-muted-foreground">7 days</p>
        </div>
      </Link>
    </li>
  );
}

/**
 * A number that came from the database, with the route that acts on it.
 *
 * `href` is not optional by accident: every figure on this page is a thing an admin then
 * does something about, and a count with nowhere to go is the "passive dashboard" this
 * page used to be.
 */
function Metric({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: number;
  href: string;
  tone?: "warn";
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary/40"
    >
      <p className="text-xs tracking-widest text-muted-foreground uppercase">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          tone === "warn" && value > 0 ? "text-destructive" : "text-card-foreground"
        }`}
      >
        {value}
      </p>
    </Link>
  );
}

export default async function AdminPage() {
  const session = await requireRole("ADMIN");
  const actor = actorFromSession(session);

  /*
   * TWO DIFFERENT SCOPES ON ONE PAGE, WHICH IS THE POINT OF ADR-013.
   *
   *   `listCaseload`  — assignment-scoped. Member practice: adherence, attention signals.
   *                     An ADMIN sees only the people assigned to them, decided in SQL.
   *
   *   `listMembers`,  — organisation-wide ADMINISTRATION. Identity, status, counts. No
   *   the counts        adherence, no activity, no check-ins. `listMembers` selects an
   *                     assignment COUNT, never who or what.
   *
   * Mixing them would be the failure the ADR exists to prevent, so the sections below are
   * labelled by which is which rather than blended into one set of figures.
   */
  const [caseload, members, pendingRequests, publishedProgrammes] = await Promise.all([
    listCaseload(actor),
    listMembers(session.organizationId, { kind: "MEMBERS" }),
    countPendingAccessRequests(session.organizationId),
    listProgrammes(session.organizationId, undefined, false, true),
  ]);

  const needsAttention = caseload.filter((c) => c.attention.flagged);
  const rest = caseload.filter((c) => !c.attention.flagged);

  const invited = members.filter((m) => m.status === "INVITED").length;
  const active = members.filter((m) => m.status === "ACTIVE").length;
  const unassigned = members.filter((m) => m.assignmentCount === 0).length;

  const yogaProgrammes = publishedProgrammes.filter((p) => p.kind === "YOGA").length;
  const dietProgrammes = publishedProgrammes.filter((p) => p.kind === "DIET").length;

  return (
    <div className="min-h-dvh bg-background">
      <AppNav role={session.role} currentPath="/admin" />

      <main className="mx-auto max-w-4xl px-6 py-10 pb-28 sm:pb-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {session.organizationName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {members.length === 0
                ? "No members yet — adding the first one is where everything starts."
                : `${members.length} member${members.length === 1 ? "" : "s"} · ${caseload.length} assigned to you`}
            </p>
          </div>

          {/* The primary action of the whole admin surface, on the page an admin lands
              on. It was previously reachable only by finding the Members tab first. */}
          <Button asChild size="sm">
            <Link href="/admin/members/new">
              <UserPlus aria-hidden />
              Add member
            </Link>
          </Button>
        </div>

        <section aria-labelledby="admin-metrics" className="mt-8">
          <h2 id="admin-metrics" className="sr-only">
            Organisation administration
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Members" value={members.length} href="/admin/members" />
            <Metric label="Active" value={active} href="/admin/members" />
            <Metric label="Invited" value={invited} href="/admin/members" />
            <Metric
              label="Access requests"
              value={pendingRequests}
              href="/admin/access-requests"
              tone="warn"
            />
          </div>

          {/*
            An administrative fact, not a health one: how many members nobody is assigned
            to. Those people cannot be prescribed for by anyone, and until the caseload
            control existed there was no way to fix it — so the number is worth surfacing
            rather than leaving to be discovered one 404 at a time.
          */}
          {unassigned > 0 && (
            <p className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              {unassigned} member{unassigned === 1 ? " is" : "s are"} not assigned to any
              admin, so nobody can see their practice or prescribe for them.{" "}
              <Link href="/admin/members" className="underline hover:text-foreground">
                Review members
              </Link>
            </p>
          )}
        </section>

        <section aria-labelledby="quick-actions" className="mt-8">
          <h2
            id="quick-actions"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Library and plans
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/programmes/new">
                <CalendarPlus aria-hidden />
                Create programme
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/yoga/new">
                <ClipboardList aria-hidden />
                Add exercise
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/diet/new">
                <Salad aria-hidden />
                Add meal
              </Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/admin/reports">
                <Inbox aria-hidden />
                Reports
              </Link>
            </Button>
          </div>

          <p className="mt-3 text-sm text-muted-foreground">
            {publishedProgrammes.length === 0 ? (
              <>
                No published programmes yet — a programme must be published before it can
                be assigned.{" "}
                <Link href="/admin/programmes" className="underline hover:text-foreground">
                  Go to programmes
                </Link>
              </>
            ) : (
              <>
                {yogaProgrammes} yoga and {dietProgrammes} diet{" "}
                {publishedProgrammes.length === 1 ? "programme" : "programmes"} published
                and ready to assign.
              </>
            )}
          </p>
        </section>

        <h2 className="mt-12 text-lg font-semibold tracking-tight text-foreground">
          Your caseload
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {session.storedRole === "ORG_OWNER"
            ? `Every member in ${session.organizationName}.`
            : "The members assigned to you."}
        </p>

        <section aria-labelledby="attention-heading" className="mt-8">
          <h2
            id="attention-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Needs your attention
          </h2>

          {needsAttention.length > 0 ? (
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {needsAttention.map((entry) => (
                <CustomerRow key={entry.customerId} entry={entry} />
              ))}
            </ul>
          ) : (
            <div className="mt-3 rounded-lg border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">
                {caseload.length === 0
                  ? members.length === 0
                    ? "Nobody is in this organisation yet. Add a member first."
                    : "No members are assigned to you yet. Open one from Members and take them into your caseload."
                  : "Nobody needs attention today."}
              </p>

              {/* The empty state leads to the action that resolves it, rather than
                  stating a fact and stopping. */}
              {caseload.length === 0 && (
                <Button asChild size="sm" variant="outline" className="mt-4">
                  <Link href={members.length === 0 ? "/admin/members/new" : "/admin/members"}>
                    {members.length === 0 ? "Add a member" : "Go to members"}
                  </Link>
                </Button>
              )}
            </div>
          )}
        </section>

        {rest.length > 0 && (
          <section aria-labelledby="everyone-heading" className="mt-10">
            <h2
              id="everyone-heading"
              className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
            >
              Everyone else · {rest.length}
            </h2>
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {rest.map((entry) => (
                <CustomerRow key={entry.customerId} entry={entry} />
              ))}
            </ul>
          </section>
        )}

        {/*
          The honesty note this product keeps making: adherence measures what customers
          REPORTED, and completion is self-declared. Saying so on the page it is read on
          matters more than saying it in a document nobody opens.
        */}
        <p className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
          Adherence is self-reported and covers the last 7 days. A dash means nothing was
          scheduled — not that nothing was done.
        </p>
      </main>
    </div>
  );
}
