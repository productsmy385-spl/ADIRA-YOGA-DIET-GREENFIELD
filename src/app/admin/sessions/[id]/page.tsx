import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppNav } from "@/components/nav/app-nav";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { formatInZone } from "@/lib/zoned-time";
import { requireRole } from "@/server/auth/guards";
import { findOrganizationById } from "@/server/repositories/organizations";
import type { Attendance } from "@/server/repositories/yoga-sessions";
import { viewSession } from "@/server/services/yoga-sessions";

import {
  addParticipantAction,
  markAttendanceAction,
  removeParticipantAction,
  saveSessionNotesAction,
  setSessionStatusAction,
} from "../actions";

export const metadata: Metadata = { title: "Session" };
export const dynamic = "force-dynamic";

const ATTENDANCE_LABEL: Record<Attendance, string> = {
  EXPECTED: "Expected",
  ATTENDED: "Attended",
  ABSENT: "Absent",
  EXCUSED: "Excused",
};

/**
 * One session: status, notes, participants and attendance. Only members the viewer can
 * reach (an active assignment) are listed by name; the rest are a count (ADR-013).
 */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("ADMIN", "TRAINER");
  const { id } = await params;
  const result = await viewSession(session, id);
  if (!result.ok) notFound();
  const { session: s, visible, hiddenCount, canMark, canManage, addable } = result.value;
  const timeZone = (await findOrganizationById(session.organizationId))?.timezone ?? "Asia/Kolkata";

  return (
    <div className="theme-bg-wrapper app-shell">
      <AppNav role={session.role} currentPath="/admin/sessions" />
      <PageShell width="default">
        <Link href="/admin/sessions" className="text-sm text-muted-foreground hover:text-foreground">
          ← Sessions
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{s.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatInZone(s.startsAt, timeZone, { dateStyle: "full", timeStyle: "short" })} · {s.durationMinutes} min · led by{" "}
              {s.instructorName}
            </p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              {(["COMPLETED", "CANCELLED", "SCHEDULED"] as const)
                .filter((st) => st !== s.status)
                .map((st) => (
                  <form key={st} action={setSessionStatusAction}>
                    <input type="hidden" name="sessionId" value={s.id} />
                    <input type="hidden" name="status" value={st} />
                    <Button type="submit" size="sm" variant={st === "COMPLETED" ? "default" : "outline"}>
                      {st === "COMPLETED" ? "Mark completed" : st === "CANCELLED" ? "Cancel session" : "Reopen"}
                    </Button>
                  </form>
                ))}
            </div>
          ) : null}
        </div>
        <p className="mt-2 text-sm">
          Status: <span className="font-semibold">{s.status.toLowerCase()}</span>
        </p>

        <section aria-labelledby="participants" className="mt-8">
          <h2 id="participants" className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Participants
          </h2>
          {visible.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No participants from your caseload yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-surface">
              {visible.map((p) => (
                <li key={p.memberId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <Link href={`/admin/customers/${p.memberId}`} className="font-medium text-foreground hover:underline">
                    {p.fullName}
                  </Link>
                  <div className="flex flex-wrap items-center gap-1">
                    {canMark ? (
                      (Object.keys(ATTENDANCE_LABEL) as Attendance[]).map((a) => (
                        <form key={a} action={markAttendanceAction}>
                          <input type="hidden" name="sessionId" value={s.id} />
                          <input type="hidden" name="memberId" value={p.memberId} />
                          <input type="hidden" name="attendance" value={a} />
                          <Button type="submit" size="xs" variant={p.attendance === a ? "default" : "ghost"} aria-pressed={p.attendance === a}>
                            {ATTENDANCE_LABEL[a]}
                          </Button>
                        </form>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">{ATTENDANCE_LABEL[p.attendance]}</span>
                    )}
                    {canManage ? (
                      <form action={removeParticipantAction}>
                        <input type="hidden" name="sessionId" value={s.id} />
                        <input type="hidden" name="memberId" value={p.memberId} />
                        <Button type="submit" size="xs" variant="ghost" aria-label={`Remove ${p.fullName}`}>
                          Remove
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {hiddenCount > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              +{hiddenCount} participant{hiddenCount === 1 ? "" : "s"} not on your caseload.
            </p>
          ) : null}

          {canManage && addable.length > 0 ? (
            <form action={addParticipantAction} className="mt-4 flex flex-wrap items-end gap-2">
              <input type="hidden" name="sessionId" value={s.id} />
              <label className="text-sm">
                <span className="block font-medium">Add from your caseload</span>
                <select name="memberId" className="mt-1.5 h-10 rounded-md border border-input bg-transparent px-3 text-sm">
                  {addable.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" size="sm">
                Add
              </Button>
            </form>
          ) : null}
        </section>

        {canManage ? (
          <section aria-labelledby="notes" className="mt-8">
            <h2 id="notes" className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              Session notes
            </h2>
            <form action={saveSessionNotesAction} className="mt-3 space-y-2">
              <input type="hidden" name="sessionId" value={s.id} />
              <textarea
                name="notes"
                rows={4}
                maxLength={2000}
                defaultValue={s.notes ?? ""}
                aria-label="Session notes"
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              />
              <Button type="submit" size="sm" variant="outline">
                Save notes
              </Button>
            </form>
          </section>
        ) : null}
      </PageShell>
    </div>
  );
}
