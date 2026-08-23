import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarCheck, TriangleAlert, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { branding } from "@/lib/branding";
import { requireTenantSession } from "@/server/auth/guards";
import { listActivitiesForDate, organizationToday } from "@/server/repositories/activities";
import { organizationSummary } from "@/server/repositories/analytics";
import { listAuditForOrganization } from "@/server/repositories/audit-logs";
import { listCaseload } from "@/server/repositories/caseload";
import { completionPercent, tally } from "@/server/services/metrics";

import { signOutAction } from "../sign-in/actions";

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
  ORG_OWNER: "Organisation owner",
  ADMIN: "Admin / consultant",
  CUSTOMER: "Customer",
};

export default async function DashboardPage() {
  const session = await requireTenantSession();
  const isStaff = session.role === "ORG_OWNER" || session.role === "ADMIN";

  // Only the queries this role is entitled to run are run at all. A customer's request
  // never touches the caseload or organisation-wide summary — the rows are not fetched
  // and then hidden in markup, they are never read.
  const [today, caseload, summary, audit] = await Promise.all([
    organizationToday(session.organizationId),
    isStaff
      ? listCaseload(session.organizationId, session.role, session.userId)
      : Promise.resolve(null),
    session.role === "ORG_OWNER"
      ? organizationSummary(session.organizationId)
      : Promise.resolve(null),
    session.role === "ORG_OWNER"
      ? listAuditForOrganization(session.organizationId, 6)
      : Promise.resolve([]),
  ]);

  // Needs `today`, which the batch above resolves, so it cannot join that Promise.all.
  const myActivities =
    session.role === "CUSTOMER"
      ? await listActivitiesForDate(session.organizationId, session.userId, today)
      : null;

  const myCounts = myActivities ? tally(myActivities.map((a) => a.status)) : null;
  const myPercent = myCounts ? completionPercent(myCounts) : null;
  const flagged = caseload?.filter((entry) => entry.attention.flagged).length ?? 0;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- static mark */}
            <img src={branding.icons.mark} alt="" aria-hidden className="size-8" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {session.organizationName}
              </p>
              <p className="text-xs text-muted-foreground">{branding.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {session.fullName}
          </h1>
          <Badge variant="secondary">{ROLE_LABEL[session.role] ?? session.role}</Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{session.email}</p>

        {/* The primary action. One per role, deliberately — a hub offering four equal
            choices is a hub that has not decided what you came here to do. */}
        {session.role === "CUSTOMER" ? (
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
