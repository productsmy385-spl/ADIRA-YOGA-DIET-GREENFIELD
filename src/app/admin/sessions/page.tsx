import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CheckCircle2, Users } from "lucide-react";

import { AppNav } from "@/components/nav/app-nav";
import { Badge } from "@/components/ui/badge";
import { MetricCard, MetricGrid } from "@/components/ui/metric";
import { PageShell } from "@/components/ui/page-shell";
import { formatInZone } from "@/lib/zoned-time";
import { requireRole } from "@/server/auth/guards";
import { findOrganizationById } from "@/server/repositories/organizations";
import { actorFromSession } from "@/server/authorization/member-access";
import { hasPermission } from "@/server/authorization/permissions";
import { listSessions, type YogaSession } from "@/server/repositories/yoga-sessions";
import { listInstructors } from "@/server/services/yoga-sessions";
import { redirect } from "next/navigation";

import { ScheduleSessionForm } from "./schedule-form";

export const metadata: Metadata = { title: "Sessions" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<YogaSession["status"], string> = {
  SCHEDULED: "bg-accent-blue/12 text-accent-blue-ink",
  COMPLETED: "bg-accent-green/12 text-accent-green-ink",
  CANCELLED: "bg-muted text-muted-foreground",
};

function SessionList({ sessions, empty, timeZone }: { sessions: YogaSession[]; empty: string; timeZone: string }) {
  if (sessions.length === 0) return <p className="mt-3 text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      {sessions.map((s) => (
        <li key={s.id}>
          <Link href={`/admin/sessions/${s.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
            <span className="min-w-0">
              <span className="block font-semibold text-foreground">{s.title}</span>
              <span className="block text-xs text-muted-foreground">
                {formatInZone(s.startsAt, timeZone)} · {s.durationMinutes} min · {s.instructorName}
              </span>
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users aria-hidden className="size-3.5" /> {s.participantCount}
              <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_TONE[s.status]}`}>{s.status.toLowerCase()}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Yoga sessions (brief §7): schedule, then manage participants and attendance on each
 * session's page. A TRAINER sees and schedules their own; an ADMIN sees all.
 */
export default async function SessionsPage() {
  const session = await requireRole("ADMIN", "TRAINER");
  if (!hasPermission(actorFromSession(session), "yoga.manage_sessions").allowed) redirect("/");

  const now = new Date();
  const instructorId = session.role === "ADMIN" ? undefined : session.userId;
  const [upcoming, recent, instructors] = await Promise.all([
    listSessions(session.organizationId, { from: now, to: new Date(now.getTime() + 30 * 864e5), instructorId }),
    listSessions(session.organizationId, { from: new Date(now.getTime() - 30 * 864e5), to: now, instructorId }),
    listInstructors(session),
  ]);
  const timeZone = (await findOrganizationById(session.organizationId))?.timezone ?? "Asia/Kolkata";
  const completed = recent.filter((s) => s.status === "COMPLETED");
  const attended = completed.reduce((n, s) => n + s.attendedCount, 0);
  const expected = completed.reduce((n, s) => n + s.participantCount, 0);

  return (
    <div className="theme-bg-wrapper app-shell">
      <AppNav role={session.role} currentPath="/admin/sessions" />
      <PageShell width="wide">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sessions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {session.role === "ADMIN" ? "Every scheduled class in the organisation." : "Classes you lead."} Times are in {timeZone}.
        </p>

        <MetricGrid columns={3} label="Sessions at a glance" className="mt-6">
          <MetricCard label="Upcoming" value={upcoming.filter((s) => s.status === "SCHEDULED").length} icon={<CalendarClock />} tone="blue" description="Next 30 days" />
          <MetricCard label="Completed" value={completed.length} icon={<CheckCircle2 />} tone="green" description="Last 30 days" />
          <MetricCard
            label="Attendance"
            value={expected === 0 ? null : `${Math.round((attended / expected) * 100)}%`}
            icon={<Users />}
            tone="violet"
            description="Completed sessions, last 30 days"
          />
        </MetricGrid>

        <section aria-labelledby="schedule" className="mt-8 rounded-2xl border border-border-glass bg-surface p-5">
          <h2 id="schedule" className="font-semibold text-foreground">
            Schedule a session
          </h2>
          <div className="mt-4">
            {instructors.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add a yoga instructor to the team first.</p>
            ) : (
              <ScheduleSessionForm instructors={instructors} chooseInstructor={session.role === "ADMIN"} />
            )}
          </div>
        </section>

        <section aria-labelledby="upcoming" className="mt-8">
          <h2 id="upcoming" className="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Upcoming <Badge variant="secondary">{upcoming.length}</Badge>
          </h2>
          <SessionList sessions={upcoming} timeZone={timeZone} empty="Nothing scheduled in the next 30 days." />
        </section>

        <section aria-labelledby="recent" className="mt-8">
          <h2 id="recent" className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Last 30 days
          </h2>
          <SessionList sessions={[...recent].reverse()} timeZone={timeZone} empty="No sessions in the last 30 days." />
        </section>
      </PageShell>
    </div>
  );
}
