import { query, queryOne } from "@/server/db/pool";
import type { ActivityStatusValue, ProgrammeKindValue } from "@/server/db/types";

/**
 * Daily activities — the customer's actual day, and the raw material for every metric.
 *
 * Dates are handled by PostgreSQL throughout: every date in and out of this module is a
 * `YYYY-MM-DD` string, formatted by `to_char` and parsed by `::date`. node-postgres
 * parses a DATE column into a JS Date at LOCAL midnight, so passing those around leaks a
 * timezone shift into anything that later calls `toISOString()` — which is how a whole
 * schedule ends up looking one day early. Keeping dates as strings at this boundary
 * removes the class of bug rather than documenting it.
 *
 * "Today" is the ORGANISATION's today (`organizations.timezone`), not the server's and
 * not the viewer's. Two people looking at the same organisation must see the same day
 * boundary, or two dashboards disagree and neither is wrong (docs/METRICS.md).
 */

export interface DailyActivity {
  id: string;
  kind: ProgrammeKindValue;
  status: ActivityStatusValue;
  scheduledFor: string;
  title: string;
  instructions: string | null;
  breathing: string | null;
  quantity: string | null;
  durationSeconds: number | null;
  repetitions: number | null;
  slot: string | null;
  sequence: number;
  startedAt: Date | null;
  completedAt: Date | null;
}

interface ActivityRow {
  id: string;
  kind: ProgrammeKindValue;
  status: ActivityStatusValue;
  scheduled_for: string;
  title: string | null;
  instructions: string | null;
  breathing: string | null;
  quantity: string | null;
  duration_seconds: number | null;
  repetitions: number | null;
  slot: string | null;
  sequence: number | null;
  started_at: Date | null;
  completed_at: Date | null;
}

function toActivity(row: ActivityRow): DailyActivity {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    scheduledFor: row.scheduled_for,
    // The item is nullable via ON DELETE SET NULL. An activity whose item was removed
    // still happened and still counts, so it keeps a readable label rather than
    // vanishing from the customer's history.
    title: row.title ?? "Activity",
    instructions: row.instructions,
    breathing: row.breathing,
    quantity: row.quantity,
    durationSeconds: row.duration_seconds,
    repetitions: row.repetitions,
    slot: row.slot,
    sequence: row.sequence ?? 0,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

const SELECT_ACTIVITY = `
  SELECT
    a.id, a.kind, a.status,
    to_char(a.scheduled_for, 'YYYY-MM-DD') AS scheduled_for,
    i.title, i.instructions, i.breathing, i.quantity,
    COALESCE(a.duration_seconds, i.duration_seconds) AS duration_seconds,
    i.repetitions, i.slot::text AS slot, i.sequence,
    a.started_at, a.completed_at
  FROM daily_activities a
  LEFT JOIN assignment_items i ON i.id = a.assignment_item_id
`;

/** The organisation's current date, as `YYYY-MM-DD`. */
export async function organizationToday(organizationId: string): Promise<string> {
  const row = await queryOne<{ today: string }>(
    `SELECT to_char((now() AT TIME ZONE o.timezone)::date, 'YYYY-MM-DD') AS today
       FROM organizations o WHERE o.id = $1`,
    [organizationId],
  );
  if (!row) throw new Error("Organization not found.");
  return row.today;
}

/** A customer's activities for one date, in the order they should be performed. */
export async function listActivitiesForDate(
  organizationId: string,
  customerId: string,
  date: string,
): Promise<DailyActivity[]> {
  const rows = await query<ActivityRow>(
    `${SELECT_ACTIVITY}
      WHERE a.organization_id = $1 AND a.customer_id = $2 AND a.scheduled_for = $3::date
      ORDER BY i.sequence NULLS LAST, a.created_at`,
    [organizationId, customerId, date],
  );
  return rows.map(toActivity);
}

/** Statuses within an inclusive date range — the raw material for `metrics.tally`. */
export async function listStatusesInRange(
  organizationId: string,
  customerId: string,
  from: string,
  to: string,
  kind?: ProgrammeKindValue,
): Promise<ActivityStatusValue[]> {
  const rows = await query<{ status: ActivityStatusValue }>(
    `SELECT status FROM daily_activities
      WHERE organization_id = $1 AND customer_id = $2
        AND scheduled_for BETWEEN $3::date AND $4::date
        AND ($5::programme_kind IS NULL OR kind = $5::programme_kind)`,
    [organizationId, customerId, from, to, kind ?? null],
  );
  return rows.map((row) => row.status);
}

export interface ActivityTransitionResult {
  ok: boolean;
  activity?: DailyActivity;
}

/**
 * Mark an activity started.
 *
 * Scoped by organisation AND customer, so a caller cannot advance somebody else's
 * activity by guessing an id — the IDOR shape for this endpoint. Only a PENDING activity
 * can start; re-starting a completed one would erase its completion time.
 */
export async function startActivity(
  organizationId: string,
  customerId: string,
  activityId: string,
): Promise<ActivityTransitionResult> {
  const rows = await query<{ id: string }>(
    `UPDATE daily_activities
        SET status = 'STARTED', started_at = COALESCE(started_at, now())
      WHERE id = $3 AND organization_id = $1 AND customer_id = $2
        AND status = 'PENDING'
      RETURNING id`,
    [organizationId, customerId, activityId],
  );
  return { ok: rows.length > 0 };
}

/**
 * Mark an activity completed.
 *
 * Accepts PENDING, STARTED, or MISSED. Allowing MISSED is deliberate: an evening
 * practice recorded the next morning is a real completion, and refusing it would train
 * customers that the app misrepresents what they did. `USER-JOURNEYS.md` J1 names a tight
 * completion window as a failure point.
 *
 * `completed_at` is set in the same statement as the status, because the schema's CHECK
 * requires them to agree — and because a completed activity with no timestamp drops out
 * of every windowed adherence query while still counting as completed.
 */
export async function completeActivity(
  organizationId: string,
  customerId: string,
  activityId: string,
  durationSeconds?: number | null,
): Promise<ActivityTransitionResult> {
  const rows = await query<{ id: string }>(
    `UPDATE daily_activities
        SET status = 'COMPLETED',
            completed_at = now(),
            started_at = COALESCE(started_at, now()),
            duration_seconds = COALESCE($4, duration_seconds)
      WHERE id = $3 AND organization_id = $1 AND customer_id = $2
        AND status IN ('PENDING', 'STARTED', 'MISSED')
      RETURNING id`,
    [organizationId, customerId, activityId, durationSeconds ?? null],
  );
  return { ok: rows.length > 0 };
}

/** Mark an activity deliberately skipped. Counts against adherence, unlike a rest day. */
export async function skipActivity(
  organizationId: string,
  customerId: string,
  activityId: string,
  note?: string | null,
): Promise<ActivityTransitionResult> {
  const rows = await query<{ id: string }>(
    `UPDATE daily_activities
        SET status = 'SKIPPED', notes = COALESCE($4, notes)
      WHERE id = $3 AND organization_id = $1 AND customer_id = $2
        AND status IN ('PENDING', 'STARTED')
      RETURNING id`,
    [organizationId, customerId, activityId, note ?? null],
  );
  return { ok: rows.length > 0 };
}

/**
 * Sweep past-due activities to MISSED. Run nightly by cron (Phase 11).
 *
 * Only touches activities belonging to an ACTIVE assignment. A paused plan schedules
 * nothing and must accumulate nothing — without that join, pausing would stop new
 * activities appearing while the existing ones quietly rotted into misses, which is the
 * wall of failure `docs/METRICS.md` exists to prevent.
 */
export async function sweepMissedActivities(): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE daily_activities a
        SET status = 'MISSED'
       FROM assignments s, organizations o
      WHERE a.assignment_id = s.id
        AND o.id = a.organization_id
        AND s.status = 'ACTIVE'
        AND a.status IN ('PENDING', 'STARTED')
        AND a.scheduled_for < (now() AT TIME ZONE o.timezone)::date
      RETURNING a.id`,
  );
  return rows.length;
}
