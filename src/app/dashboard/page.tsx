import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarCheck, TriangleAlert, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppNav, MobileTabBar } from "@/components/nav/app-nav";
import { requireTenantSession } from "@/server/auth/guards";
import { listActivitiesForDate, organizationToday } from "@/server/repositories/activities";
import { organizationSummary } from "@/server/repositories/analytics";
import { listAuditForOrganization } from "@/server/repositories/audit-logs";
import { listCaseload } from "@/server/repositories/caseload";
import { actorFromSession } from "@/server/authorization/member-access";
import { completionPercent, tally } from "@/server/services/metrics";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/**
 * The hub you land on after signing in.
 *
 * It was previously a dead end — it reported who you were and offered nowhere to go,
 * so the product looked unfinished even though `/today` and `/admin` were fully built.
 * Its job now is to route: one prominent action appropriate to your role, backed by the
 * real numbers behind it.
 *
 * Every figure is read from PostgreSQL at request time. Where there is genuinely no data
 * — no plan assigned, nothing scheduled today — it says so, rather than rendering a zero
 * that reads as a failure. `completionPercent` returns null rather than 0 for exactly
 * this reason, and that distinction is preserved all the way to the screen.
 */

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  USER: "Member",
};

export default async function DashboardPage() {
  const session = await requireTenantSession();
  const isStaff = session.role === "ADMIN";

  // Only the queries this role is entitled to run are run at all. A customer's request
  // never touches the caseload or organisation-wide summary — the rows are not fetched
  // and then hidden in markup, they are never read.
  const [today, caseload, summary, audit] = await Promise.all([
    organizationToday(session.organizationId),
    isStaff
      ? listCaseload(actorFromSession(session))
      : Promise.resolve(null),
    session.role === "ADMIN"
      ? organizationSummary(session.organizationId)
      : Promise.resolve(null),
    session.role === "ADMIN"
      ? listAuditForOrganization(session.organizationId, 6)
      : Promise.resolve([]),
  ]);

  // Needs `today`, which the batch above resolves, so it cannot join that Promise.all.
  const myActivities =
    session.role === "USER"
      ? await listActivitiesForDate(session.organizationId, session.userId, today)
      : null;

  const myCounts = myActivities ? tally(myActivities.map((a) => a.status)) : null;
  const myPercent = myCounts ? completionPercent(myCounts) : null;
  const flagged = caseload?.filter((entry) => entry.attention.flagged).length ?? 0;

  return (
    <div className="theme-bg-wrapper theme-green-nature flex min-h-dvh flex-col bg-background">
      {/*
        The shared shell, so this page has the same navigation as every other. It used to
        carry a bespoke header whose only link was sign-out — which meant the page a
        customer lands on after signing in had no route to Today, Progress, Reports or
        Notifications except by typing a URL.
      */}
      <AppNav role={session.role} currentPath="/dashboard" />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10 pb-28 sm:pb-10">
        <p className="text-sm text-muted-foreground">{session.organizationName}</p>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {session.fullName}
          </h1>
          <Badge variant="secondary">{ROLE_LABEL[session.role] ?? session.role}</Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{session.email}</p>

        {/* The primary action. One per role, deliberately — a hub offering four equal
            choices is a hub that has not decided what you came here to do. */}
        {session.role === "USER" ? (
          <section className="mt-8 rounded-xl border border-border bg-card p-6">
            <div className="flex items-start gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <CalendarCheck className="size-5" aria-hidden />
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="font-medium text-card-foreground">Today&rsquo;s practice</h2>

                {myActivities && myActivities.length > 0 ? (
                  <>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {myCounts!.completed} of {myActivities.length} done
                      {myPercent !== null ? ` · ${myPercent}% complete` : ""}
                    </p>
                    <div
                      className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={myPercent ?? 0}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Today's completion"
                    >
                      <div
                        className="h-full rounded-full bg-primary transition-[width]"
                        style={{ width: `${myPercent ?? 0}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Nothing is scheduled for today. When your consultant assigns a
                    programme, your daily practice appears here.
                  </p>
                )}

                <Button asChild className="mt-5">
                  <Link href="/today">
                    Open today
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </div>
            </div>
          </section>
        ) : (
          <section className="mt-8 rounded-xl border border-border bg-card p-6">
            <div className="flex items-start gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <Users className="size-5" aria-hidden />
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="font-medium text-card-foreground">Your caseload</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {caseload && caseload.length > 0
                    ? `${caseload.length} customer${caseload.length === 1 ? "" : "s"}`
                    : session.role === "ADMIN"
                      ? "No customers are assigned to you yet."
                      : "No customers in this organisation yet."}
                  {flagged > 0 ? (
                    <>
                      {" · "}
                      <span className="inline-flex items-center gap-1 text-destructive">
                        <TriangleAlert className="size-3.5" aria-hidden />
                        {flagged} need attention
                      </span>
                    </>
                  ) : null}
                </p>

                <Button asChild className="mt-5">
                  <Link href="/admin">
                    Open caseload
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </div>
            </div>
          </section>
        )}

        {summary ? (
          <section aria-labelledby="org-heading" className="mt-10">
            <h2
              id="org-heading"
              className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
            >
              {session.organizationName}
            </h2>

            <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Customers" value={summary.totalCustomers} />
              <Stat label="Active (14 days)" value={summary.activeCustomers} />
              <Stat label="Consultants" value={summary.consultants} />
              <Stat
                label="Adherence (7 days)"
                value={
                  summary.adherence7d === null
                    ? null
                    : `${Math.round(summary.adherence7d * 100)}%`
                }
              />
            </dl>
          </section>
        ) : null}

        <section aria-labelledby="account-heading" className="mt-10">
          <h2
            id="account-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Your account
          </h2>

          <dl className="mt-4 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
            <Field label="Organisation" value={session.organizationName} />
            <Field label="Organisation ref" value={session.organizationSlug} mono />
            <Field label="Role" value={ROLE_LABEL[session.role] ?? session.role} />
            <Field
              label="Session expires"
              value={session.expiresAt.toLocaleString("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            />
          </dl>
        </section>

        {audit.length > 0 ? (
          <section aria-labelledby="audit-heading" className="mt-10">
            <h2
              id="audit-heading"
              className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
            >
              Recent activity
            </h2>

            <ul className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {audit.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                >
                  <span className="font-mono text-xs text-card-foreground">
                    {entry.action}
                  </span>
                  <span className="text-muted-foreground">{entry.actorLabel ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">
                    {entry.createdAt.toLocaleString("en-GB", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>

      <MobileTabBar role={session.role} currentPath="/dashboard" />
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-card px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-1 text-sm text-card-foreground ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

/**
 * `null` renders as an em dash, not as 0.
 *
 * Adherence with nothing scheduled is genuinely unknown, and showing 0% would read as
 * total failure. `completionPercent` and `adherence7d` both return null for this case;
 * collapsing that to a number here would throw away the distinction they exist to keep.
 */
function Stat({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-3xl font-semibold tabular-nums text-card-foreground">
        {value === null ? <span className="text-muted-foreground">—</span> : value}
      </dd>
    </div>
  );
}
