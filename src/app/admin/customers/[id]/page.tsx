import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/server/auth/guards";
import {
  listActivitiesForDate,
  listStatusesInRange,
  organizationToday,
} from "@/server/repositories/activities";
import { listAssignmentsForCustomer } from "@/server/repositories/assignments";
import { listProgrammes } from "@/server/repositories/programmes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  activateAssignmentAction,
  pauseAssignmentAction,
} from "./actions";
import { AssignProgrammeForm } from "./assign-programme-form";
import { MessageForm } from "./message-form";
import { ReleaseFromCaseload, TakeIntoCaseload } from "./caseload-controls";
import { AppNav } from "@/components/nav/app-nav";
import { ReportSummary } from "@/components/reports/report-summary";
import { recordAudit } from "@/server/repositories/audit-logs";
import {
  actorFromSession,
  resolveMemberAccessAudited,
} from "@/server/authorization/member-access";
import { canManageOrganization } from "@/server/authorization/permissions";
import { listCheckInsInRange } from "@/server/repositories/checkins";
import { listReportsForMember } from "@/server/repositories/reports";
import { findUserById } from "@/server/repositories/users";
import { completionPercent, tally } from "@/server/services/metrics";

export const metadata: Metadata = { title: "Customer" };
export const dynamic = "force-dynamic";

/**
 * One customer's record, for the consultant who serves them.
 *
 * AUTHORIZATION HAPPENS BEFORE ANY DATA IS READ.
 *
 * `resolveMemberAccessAudited` is asked first, and its answer selects between three
 * outcomes — not two. Reading first and filtering afterwards would be wrong even where
 * the rendered output matched, because the row would have been retrieved and a later
 * logging change or error path could surface it.
 *
 *   NOT IN THIS ORGANISATION   404, identical to a nonexistent id. A 403 that is
 *                              distinguishable from a 404 confirms the record exists,
 *                              which turns this URL into an oracle for enumerating
 *                              another tenant's roll.
 *
 *   IN THE ORGANISATION,       Administrative view: name, address, status, and the
 *   NOT ON THIS CASELOAD       control to take them on. No practice data is FETCHED,
 *                              not merely hidden. This case is not a 404 because
 *                              `/admin/members` already lists these people by name to
 *                              every admin — the existence is not the secret, the health
 *                              record is (ADR-013).
 *
 *   ASSIGNED                   The full record.
 */

function subtractDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireRole("ADMIN", "TRAINER", "STAFF");
  const actor = actorFromSession(session);

  // One gate for every member-sensitive read (ADR-013). It performs the assignment
  // lookup and writes the DENIED audit entry itself, so no call site can forget either.
  const { decision, memberExists } = await resolveMemberAccessAudited(
    actor,
    id,
    "customer.view",
  );

  /*
   * NOT ONE OF OURS → 404, the same response a nonexistent id gets.
   *
   * `memberExists` is resolved scoped to the actor's own organization, so this covers
   * both "no such user" and "a user in another tenant". Keeping them indistinguishable is
   * what stops this URL becoming an oracle for enumerating another organisation's roll.
   */
  if (!memberExists) notFound();

  const customer = await findUserById(id, session.organizationId);
  if (!customer) notFound();

  /*
   * IN THIS ORGANISATION, BUT NOT ON THIS ADMIN'S CASELOAD.
   *
   * This used to be a 404 as well, which was wrong in a way that broke the product rather
   * than merely annoying: the member is already listed by name on `/admin/members` — an
   * org-wide ADMINISTRATIVE surface every admin may see — so 404-ing here disclosed
   * nothing extra, and left the "Open" button on that list permanently broken with no
   * route to the one action that fixes it.
   *
   * ADR-013 splits the two questions precisely so this case has an answer. Administrative
   * reach is organisation-wide, so identity and status are shown. Health-data reach is
   * assignment-scoped, so NOTHING below is fetched: no activities, no check-ins, no
   * adherence, no plans, no reports. The denial is already audited above.
   */
  if (!decision.allowed) {
    const manageable = canManageOrganization(actor).allowed;

    return (
      <div className="min-h-dvh bg-background">
        <AppNav role={session.role} currentPath="/admin/members" />

        <main className="mx-auto max-w-3xl px-6 py-10 pb-28 sm:pb-10">
          <Link
            href="/admin/members"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Members
          </Link>

          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
            {customer.fullName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {customer.email} · {customer.status.toLowerCase()}
          </p>

          <div className="mt-8 rounded-xl border border-dashed border-border p-8">
            <h2 className="text-sm font-medium text-foreground">
              You are not assigned to this member
            </h2>
            <p className="mt-2 max-w-prose text-sm/relaxed text-muted-foreground">
              Their practice — activities, check-ins, adherence and plans — is only
              readable by an admin they are assigned to. Administering the account and
              reading someone&rsquo;s health record are different permissions.
            </p>

            {manageable ? (
              <>
                <div className="mt-5">
                  <TakeIntoCaseload customerId={id} />
                </div>
                <p className="type-meta mt-3 text-muted-foreground">
                  Taking somebody on is recorded in the audit trail, and you can release
                  them again at any time.
                </p>
              </>
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">
                Ask an administrator of {session.organizationName} to assign them to you.
              </p>
            )}
          </div>
        </main>
      </div>
    );
  }

  const today = await organizationToday(session.organizationId);
  const weekAgo = subtractDays(today, 6);

  const [assignments, todayActivities, weekStatuses, checkIns, programmes, reports] =
    await Promise.all([
      listAssignmentsForCustomer(session.organizationId, id),
      listActivitiesForDate(session.organizationId, id, today),
      listStatusesInRange(session.organizationId, id, weekAgo, today),
      listCheckInsInRange(session.organizationId, id, weekAgo, today),
      /*
       * Templates available to PRESCRIBE, which is narrower than "templates".
       *
       * Archived ones are excluded because withdrawing a template should stop it being
       * handed out — most of the point of archiving. Drafts are excluded because
       * migration 009 makes publishing the deliberate act that says a programme is
       * finished; offering a half-built one here is how a member ends up with a plan
       * somebody was still writing.
       */
      listProgrammes(session.organizationId, undefined, false, true),
      // Member-scoped reports, behind the same assignment gate as everything else on this
      // page. `listReportsForMember` requires the customer id in its WHERE clause, so
      // there is no variant of this call that returns anybody else's.
      listReportsForMember(session.organizationId, id, 6),
    ]);

  const weekPercent = completionPercent(tally(weekStatuses));
  const livePlan = assignments.find((a) => a.status === "ACTIVE");

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: "customer.view",
    resourceType: "user",
    resourceId: id,
    outcome: "SUCCESS",
  });

  return (
    <div className="min-h-dvh bg-background">
      <AppNav role={session.role} currentPath="/admin" />

      <main className="mx-auto max-w-3xl px-6 py-10 pb-28 sm:pb-10">
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Caseload
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {customer.fullName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {customer.email} · {customer.status.toLowerCase()}
            </p>
          </div>

          {/* The counterpart to taking somebody on. Present only where reach exists,
              because releasing an assignment you do not hold is not a real action. */}
          <ReleaseFromCaseload customerId={id} />
        </div>

        <section aria-labelledby="plans-heading" className="mt-8">
          <h2
            id="plans-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Plans
          </h2>

          {assignments.length > 0 ? (
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {assignments.map((assignment) => (
                <li key={assignment.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className="min-w-40 flex-1">
                    <p className="text-sm text-card-foreground">{assignment.name}</p>
                    <p className="type-meta mt-0.5 text-muted-foreground">
                      {assignment.kind === "YOGA" ? "Yoga" : "Diet"} · from{" "}
                      {assignment.startsOn} · {assignment.durationWeeks} week
                      {assignment.durationWeeks === 1 ? "" : "s"} · template v
                      {assignment.sourceVersion}
                    </p>
                  </div>

                  <Badge
                    variant={assignment.status === "ACTIVE" ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {assignment.status}
                  </Badge>

                  {/*
                    DRAFT and PAUSED both activate; ACTIVE pauses. COMPLETED and CANCELLED
                    offer nothing — they are terminal, and a control that silently does
                    nothing is worse than no control.
                  */}
                  {assignment.status === "ACTIVE" ? (
                    <form action={pauseAssignmentAction}>
                      <input type="hidden" name="customerId" value={id} />
                      <input type="hidden" name="assignmentId" value={assignment.id} />
                      <Button type="submit" size="sm" variant="ghost">
                        Pause
                      </Button>
                    </form>
                  ) : assignment.status === "DRAFT" || assignment.status === "PAUSED" ? (
                    <form action={activateAssignmentAction}>
                      <input type="hidden" name="customerId" value={id} />
                      <input type="hidden" name="assignmentId" value={assignment.id} />
                      <Button type="submit" size="sm" variant="outline">
                        {assignment.status === "DRAFT" ? "Start" : "Resume"}
                      </Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No plan assigned yet.
            </p>
          )}

          <div className="mt-5 rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-medium text-card-foreground">Assign a plan</h3>
            <div className="mt-4">
              <AssignProgrammeForm
                customerId={id}
                today={today}
                programmes={programmes.map((p) => ({
                  id: p.id,
                  name: p.name,
                  kind: p.kind,
                  durationWeeks: p.durationWeeks,
                  itemCount: p.itemCount,
                }))}
              />
            </div>
          </div>
        </section>

        <section aria-label="Summary" className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs tracking-widest text-muted-foreground uppercase">
              Adherence · 7 days
            </p>
            <p className="mt-1 text-2xl font-semibold text-card-foreground">
              {weekPercent === null ? "—" : `${weekPercent}%`}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs tracking-widest text-muted-foreground uppercase">
              Check-ins · 7 days
            </p>
            <p className="mt-1 text-2xl font-semibold text-card-foreground">
              {checkIns.length}
            </p>
          </div>
        </section>

        <section aria-labelledby="plan-heading" className="mt-10">
          <h2
            id="plan-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Programme
          </h2>
          {livePlan ? (
            <div className="mt-3 rounded-lg border border-border bg-card p-5">
              <p className="font-medium text-card-foreground">{livePlan.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {livePlan.kind === "YOGA" ? "Yoga" : "Diet"} · started{" "}
                {livePlan.startsOn} · {livePlan.durationWeeks} weeks
              </p>
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
              No active programme.
            </p>
          )}
        </section>

        <section aria-labelledby="today-heading" className="mt-10">
          <h2
            id="today-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Today
          </h2>
          {todayActivities.length > 0 ? (
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {todayActivities.map((activity) => (
                <li
                  key={activity.id}
                  className="flex items-center justify-between gap-4 px-5 py-3.5"
                >
                  <span className="text-sm text-card-foreground">{activity.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {activity.status.toLowerCase().replace("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Nothing scheduled for today.
            </p>
          )}
        </section>

        <section aria-labelledby="checkins-heading" className="mt-10">
          <h2
            id="checkins-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Recent check-ins
          </h2>
          {checkIns.length > 0 ? (
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {[...checkIns].reverse().map((checkIn) => (
                <li key={checkIn.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-card-foreground">
                      {checkIn.checkinDate}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      mood {checkIn.mood ?? "—"} · sleep {checkIn.sleepQuality ?? "—"} ·
                      water {checkIn.waterGlasses ?? "—"}
                    </span>
                  </div>
                  {checkIn.notes && (
                    <p className="mt-1.5 text-sm text-muted-foreground">{checkIn.notes}</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No check-ins in the last 7 days.
            </p>
          )}
        </section>

        <section aria-labelledby="reports-heading" className="mt-10">
          <h2
            id="reports-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Reports
          </h2>

          {reports.length > 0 ? (
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {reports.map((report) => (
                <li key={report.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-card-foreground">
                        {report.kind.toLowerCase().replace(/_/g, " ")}
                      </p>
                      <p className="type-meta mt-0.5 text-muted-foreground">
                        {report.periodStart} to {report.periodEnd}
                      </p>
                    </div>
                    <Badge variant={report.status === "READY" ? "secondary" : "outline"}>
                      {report.status.toLowerCase()}
                    </Badge>
                  </div>

                  {/* The frozen figures, not a re-query. Same component the member sees,
                      so a consultant and their member are looking at one set of numbers
                      rather than two that could disagree. */}
                  {report.status === "READY" && <ReportSummary payload={report.payload} />}
                </li>
              ))}
            </ul>
          ) : (
            /*
              Reports are generated by the nightly job, not on demand from this page. Saying
              so is the difference between an empty section and one that looks broken —
              and it stops an admin hunting for a "generate" button that should not exist,
              because a report's payload is frozen at generation (ADR-009's sibling rule).
            */
            <p className="mt-3 text-sm/relaxed text-muted-foreground">
              No reports yet. Weekly reports are generated by the scheduled job once there
              is a full period of activity to summarise.
            </p>
          )}
        </section>

        <section aria-labelledby="message-heading" className="mt-10">
          <h2
            id="message-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Send a message
          </h2>

          <div className="mt-3 rounded-lg border border-border bg-card p-5">
            <MessageForm customerId={id} />
            <p className="type-meta mt-4 text-muted-foreground">
              Arrives in their notifications immediately, and by push unless they have
              muted it.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
