import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus, ClipboardList, Salad } from "lucide-react";

import { CaseloadList } from "@/components/caseload/caseload-list";
import { AppNav } from "@/components/nav/app-nav";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/server/auth/guards";
import { actorFromSession } from "@/server/authorization/member-access";
import { canManageProgrammes, hasPermission } from "@/server/authorization/permissions";
import { formatInZone, zonedToUtc } from "@/lib/zoned-time";
import { organizationToday } from "@/server/repositories/activities";
import { findOrganizationById } from "@/server/repositories/organizations";
import { listSessions } from "@/server/repositories/yoga-sessions";
import { listCaseload } from "@/server/repositories/caseload";
import { listProgrammes } from "@/server/repositories/programmes";

export const metadata: Metadata = { title: "My customers" };
export const dynamic = "force-dynamic";

/**
 * The trainer's dashboard.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT MAKES THIS A DIFFERENT PAGE FROM `/admin`, AND WHAT DOES NOT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The caseload itself is IDENTICAL and is the same component, because the question is the
 * same one: who am I responsible for, and who needs me today. `listCaseload` scopes by
 * `consultant_assignments` for every role, so a trainer's list is theirs by the same
 * mechanism an admin's is.
 *
 * What is absent is the point. `/admin` also carries organisation administration —
 * member counts, invited accounts, pending access requests, "add member". A TRAINER has
 * `canManageOrganization` false, so every one of those controls would redirect. They are
 * not hidden here; there was never a version of this page that fetched them.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE GUARD IS EXACT, NOT A RANK THRESHOLD
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `requireRole("TRAINER")` admits trainers only. An ADMIN reaching this URL is redirected
 * to their own home rather than shown a subset of their own dashboard — two roles sharing
 * a route is how "which page am I on" stops predicting "what am I allowed to do".
 */
export default async function TrainerPage() {
  const session = await requireRole("TRAINER", "DIETITIAN");
  const actor = actorFromSession(session);

  const [caseload, publishedProgrammes] = await Promise.all([
    listCaseload(actor),
    // Library counts only — a template belongs to the organisation and names nobody, so
    // this is not member data and needs no assignment.
    listProgrammes(session.organizationId, undefined, false, true),
  ]);

  // ADR-016: what this role may author — a dietitian builds diet only.
  const authorsYoga = canManageProgrammes(actor, "yoga").allowed;

  // Today's classes this person leads, in the organisation's day (brief §7 instructor tools).
  const runsSessions = hasPermission(actor, "yoga.manage_sessions").allowed;
  const timeZone = (await findOrganizationById(session.organizationId))?.timezone ?? "Asia/Kolkata";
  const dayStart = zonedToUtc(await organizationToday(session.organizationId), "00:00", timeZone)!;
  const todaysSessions = runsSessions
    ? await listSessions(session.organizationId, {
        from: dayStart,
        to: new Date(dayStart.getTime() + 864e5),
        instructorId: session.userId,
      })
    : [];
  const yoga = publishedProgrammes.filter((p) => p.kind === "YOGA").length;
  const diet = publishedProgrammes.filter((p) => p.kind === "DIET").length;

  return (
    <div className="theme-bg-wrapper theme-green-nature app-shell">
      <AppNav role={session.role} currentPath="/trainer" />

      <PageShell env="env-caseload" width="narrow">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          My customers
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {caseload.length === 0
            ? `Nobody at ${session.organizationName} is assigned to you yet.`
            : `${caseload.length} ${caseload.length === 1 ? "person" : "people"} assigned to you at ${session.organizationName}.`}
        </p>

        {runsSessions ? (
          <section aria-labelledby="today-sessions" className="mt-8">
            <h2 id="today-sessions" className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              Today&rsquo;s sessions
            </h2>
            {todaysSessions.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No classes today. <Link href="/admin/sessions" className="underline">Schedule one</Link>
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-surface">
                {todaysSessions.map((t) => (
                  <li key={t.id}>
                    <Link href={`/admin/sessions/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
                      <span className="font-medium text-foreground">{t.title}</span>
                      <span className="text-sm text-muted-foreground">
                        {formatInZone(t.startsAt, timeZone, { hour: "2-digit", minute: "2-digit" })} · {t.participantCount} expected · take attendance
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <section aria-labelledby="library" className="mt-8">
          <h2
            id="library"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Plans you can build
          </h2>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/programmes/new">
                <CalendarPlus aria-hidden />
                Create programme
              </Link>
            </Button>
            {authorsYoga ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/yoga/new">
                  <ClipboardList aria-hidden />
                  Add exercise
                </Link>
              </Button>
            ) : null}
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/diet/new">
                <Salad aria-hidden />
                Add meal
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
                {yoga} yoga and {diet} diet{" "}
                {publishedProgrammes.length === 1 ? "programme" : "programmes"} published
                and ready to assign.
              </>
            )}
          </p>
        </section>

        <CaseloadList
          entries={caseload}
          emptyMessage="No customers are assigned to you yet. An administrator assigns them."
        />
      </PageShell>

    </div>
  );
}
