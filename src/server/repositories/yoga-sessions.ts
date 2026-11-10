/**
 * Scheduled yoga sessions and attendance (migration 015).
 *
 * TENANT SCOPE: every function takes `organizationId` from the caller's session and every
 * statement filters on it; session and member ids are always matched TOGETHER with it, and
 * the composite foreign keys make a cross-tenant participant unrepresentable anyway.
 *
 * This module answers "what exists". WHO may see a participant's attendance is the
 * service's question (`canAccessMemberData`), never this file's.
 */

import { query, queryOne } from "@/server/db/pool";

export type SessionStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";
export type Attendance = "EXPECTED" | "ATTENDED" | "ABSENT" | "EXCUSED";

export interface YogaSession {
  id: string;
  title: string;
  startsAt: Date;
  durationMinutes: number;
  instructorId: string;
  instructorName: string;
  status: SessionStatus;
  notes: string | null;
  participantCount: number;
  attendedCount: number;
}

interface SessionRow {
  id: string;
  title: string;
  starts_at: Date;
  duration_minutes: number;
  instructor_id: string;
  instructor_name: string;
  status: SessionStatus;
  notes: string | null;
  participant_count: number;
  attended_count: number;
}

const SESSION_SELECT = `
  SELECT s.id, s.title, s.starts_at, s.duration_minutes, s.instructor_id,
         i.full_name AS instructor_name, s.status, s.notes,
         (SELECT count(*) FROM yoga_session_participants p
           WHERE p.session_id = s.id AND p.organization_id = s.organization_id)::int AS participant_count,
         (SELECT count(*) FROM yoga_session_participants p
           WHERE p.session_id = s.id AND p.organization_id = s.organization_id
             AND p.attendance = 'ATTENDED')::int AS attended_count
    FROM yoga_sessions s
    JOIN users i ON i.id = s.instructor_id AND i.organization_id = s.organization_id`;

function toSession(r: SessionRow): YogaSession {
  return {
    id: r.id,
    title: r.title,
    startsAt: r.starts_at,
    durationMinutes: r.duration_minutes,
    instructorId: r.instructor_id,
    instructorName: r.instructor_name,
    status: r.status,
    notes: r.notes,
    participantCount: r.participant_count,
    attendedCount: r.attended_count,
  };
}

export async function createSession(
  organizationId: string,
  input: {
    title: string;
    startsAt: Date;
    durationMinutes: number;
    instructorId: string;
    notes: string | null;
    createdBy: string;
  },
): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO yoga_sessions
       (organization_id, title, starts_at, duration_minutes, instructor_id, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      organizationId,
      input.title,
      input.startsAt,
      input.durationMinutes,
      input.instructorId,
      input.notes,
      input.createdBy,
    ],
  );
  return row!.id;
}

export async function findSession(organizationId: string, sessionId: string): Promise<YogaSession | null> {
  const row = await queryOne<SessionRow>(
    `${SESSION_SELECT} WHERE s.organization_id = $1 AND s.id = $2`,
    [organizationId, sessionId],
  );
  return row ? toSession(row) : null;
}

/** Sessions in a time window, optionally for one instructor. */
export async function listSessions(
  organizationId: string,
  options: { from: Date; to: Date; instructorId?: string },
): Promise<YogaSession[]> {
  const rows = await query<SessionRow>(
    `${SESSION_SELECT}
      WHERE s.organization_id = $1
        AND s.starts_at >= $2 AND s.starts_at < $3
        AND ($4::uuid IS NULL OR s.instructor_id = $4)
      ORDER BY s.starts_at`,
    [organizationId, options.from, options.to, options.instructorId ?? null],
  );
  return rows.map(toSession);
}

export async function setSessionStatus(
  organizationId: string,
  sessionId: string,
  status: SessionStatus,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `UPDATE yoga_sessions SET status = $3 WHERE organization_id = $1 AND id = $2 RETURNING id`,
    [organizationId, sessionId, status],
  );
  return row !== null;
}

export async function updateSessionNotes(
  organizationId: string,
  sessionId: string,
  notes: string | null,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `UPDATE yoga_sessions SET notes = $3 WHERE organization_id = $1 AND id = $2 RETURNING id`,
    [organizationId, sessionId, notes],
  );
  return row !== null;
}

export interface Participant {
  memberId: string;
  fullName: string;
  attendance: Attendance;
}

export async function listParticipants(organizationId: string, sessionId: string): Promise<Participant[]> {
  const rows = await query<{ member_id: string; full_name: string; attendance: Attendance }>(
    `SELECT p.member_id, u.full_name, p.attendance
       FROM yoga_session_participants p
       JOIN users u ON u.id = p.member_id AND u.organization_id = p.organization_id
      WHERE p.organization_id = $1 AND p.session_id = $2
      ORDER BY u.full_name`,
    [organizationId, sessionId],
  );
  return rows.map((r) => ({ memberId: r.member_id, fullName: r.full_name, attendance: r.attendance }));
}

export async function addParticipant(organizationId: string, sessionId: string, memberId: string): Promise<void> {
  await query(
    `INSERT INTO yoga_session_participants (session_id, organization_id, member_id)
     VALUES ($2, $1, $3)
     ON CONFLICT DO NOTHING`,
    [organizationId, sessionId, memberId],
  );
}

export async function removeParticipant(organizationId: string, sessionId: string, memberId: string): Promise<boolean> {
  const row = await queryOne<{ member_id: string }>(
    `DELETE FROM yoga_session_participants
      WHERE organization_id = $1 AND session_id = $2 AND member_id = $3
      RETURNING member_id`,
    [organizationId, sessionId, memberId],
  );
  return row !== null;
}

export async function markAttendance(
  organizationId: string,
  sessionId: string,
  memberId: string,
  attendance: Attendance,
  markedBy: string,
): Promise<boolean> {
  const row = await queryOne<{ member_id: string }>(
    `UPDATE yoga_session_participants
        SET attendance = $4, marked_at = now(), marked_by = $5
      WHERE organization_id = $1 AND session_id = $2 AND member_id = $3
      RETURNING member_id`,
    [organizationId, sessionId, memberId, attendance, markedBy],
  );
  return row !== null;
}

/** A member's OWN sessions — for their own pages only (self-access). */
export async function listMemberSessions(
  organizationId: string,
  memberId: string,
  from: Date,
  limit = 10,
): Promise<Array<YogaSession & { attendance: Attendance }>> {
  // Counts are not shown to a member (other participants are not their business), so this
  // selects zeros for them rather than counting other people's rows.
  const rows = await query<SessionRow & { attendance: Attendance }>(
    `SELECT s.id, s.title, s.starts_at, s.duration_minutes, s.instructor_id,
            i.full_name AS instructor_name, s.status,
            NULL::text AS notes, -- instructor's notes can mention other participants
            0 AS participant_count, 0 AS attended_count, mp.attendance
       FROM yoga_sessions s
       JOIN yoga_session_participants mp
         ON mp.session_id = s.id AND mp.organization_id = s.organization_id
       JOIN users i ON i.id = s.instructor_id AND i.organization_id = s.organization_id
      WHERE s.organization_id = $1 AND mp.member_id = $2 AND s.starts_at >= $3
        AND s.status <> 'CANCELLED'
      ORDER BY s.starts_at
      LIMIT $4`,
    [organizationId, memberId, from, limit],
  );
  return rows.map((r) => ({ ...toSession(r), attendance: r.attendance }));
}

/** Organisation-level aggregates — counts only, nobody named (analytics). */
export async function sessionStats(
  organizationId: string,
  days: number,
): Promise<{ completed: number; scheduled: number; attended: number; marked: number }> {
  const row = await queryOne<{ completed: number; scheduled: number; attended: number; marked: number }>(
    `SELECT
       (SELECT count(*) FROM yoga_sessions WHERE organization_id = $1 AND status = 'COMPLETED'
          AND starts_at > now() - make_interval(days => $2))::int AS completed,
       (SELECT count(*) FROM yoga_sessions WHERE organization_id = $1 AND status = 'SCHEDULED'
          AND starts_at >= now() AND starts_at < now() + make_interval(days => $2))::int AS scheduled,
       (SELECT count(*) FROM yoga_session_participants p JOIN yoga_sessions s
           ON s.id = p.session_id AND s.organization_id = p.organization_id
         WHERE p.organization_id = $1 AND p.attendance = 'ATTENDED'
           AND s.starts_at > now() - make_interval(days => $2))::int AS attended,
       (SELECT count(*) FROM yoga_session_participants p JOIN yoga_sessions s
           ON s.id = p.session_id AND s.organization_id = p.organization_id
         WHERE p.organization_id = $1 AND p.attendance IN ('ATTENDED', 'ABSENT')
           AND s.starts_at > now() - make_interval(days => $2))::int AS marked`,
    [organizationId, days],
  );
  return row ?? { completed: 0, scheduled: 0, attended: 0, marked: 0 };
}

export interface TeamWorkload {
  userId: string;
  sessionsUpcoming: number;
  sessionsCompleted30d: number;
}

/** Per team member — counts only (team page workload). */
export async function teamSessionWorkload(organizationId: string): Promise<Map<string, TeamWorkload>> {
  const rows = await query<{ instructor_id: string; upcoming: number; completed: number }>(
    `SELECT instructor_id,
            count(*) FILTER (WHERE status = 'SCHEDULED' AND starts_at >= now()
                               AND starts_at < now() + interval '7 days')::int AS upcoming,
            count(*) FILTER (WHERE status = 'COMPLETED'
                               AND starts_at > now() - interval '30 days')::int AS completed
       FROM yoga_sessions
      WHERE organization_id = $1
      GROUP BY instructor_id`,
    [organizationId],
  );
  return new Map(
    rows.map((r) => [r.instructor_id, { userId: r.instructor_id, sessionsUpcoming: r.upcoming, sessionsCompleted30d: r.completed }]),
  );
}
