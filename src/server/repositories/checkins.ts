import { query, queryOne } from "@/server/db/pool";

/**
 * Daily wellness check-ins (§17).
 *
 * Deliberately small. §17 says collect only what the product needs, and this is health
 * information about identifiable people — every extra field is a liability we would then
 * be responsible for holding, not a feature.
 *
 * Dates cross this boundary as `YYYY-MM-DD` strings for the same reason they do in
 * `activities.ts`: a DATE column read into a JS Date lands at LOCAL midnight, and any
 * later `toISOString()` shifts it a day.
 */

export interface CheckIn {
  id: string;
  checkinDate: string;
  mood: number | null;
  sleepQuality: number | null;
  sleepMinutes: number | null;
  waterGlasses: number | null;
  notes: string | null;
  updatedAt: Date;
}

interface CheckInRow {
  id: string;
  checkin_date: string;
  mood: number | null;
  sleep_quality: number | null;
  sleep_minutes: number | null;
  water_glasses: number | null;
  notes: string | null;
  updated_at: Date;
}

const COLUMNS = `
  id, to_char(checkin_date, 'YYYY-MM-DD') AS checkin_date,
  mood, sleep_quality, sleep_minutes, water_glasses, notes, updated_at
`;

function toCheckIn(row: CheckInRow): CheckIn {
  return {
    id: row.id,
    checkinDate: row.checkin_date,
    mood: row.mood,
    sleepQuality: row.sleep_quality,
    sleepMinutes: row.sleep_minutes,
    waterGlasses: row.water_glasses,
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

export interface CheckInInput {
  mood?: number | null;
  sleepQuality?: number | null;
  sleepMinutes?: number | null;
  waterGlasses?: number | null;
  notes?: string | null;
}

/**
 * Record or amend a customer's check-in for a date.
 *
 * An upsert, because §17's check-in is one per day and a second submission is an
 * amendment rather than a new record — the schema enforces that with a unique
 * constraint. Someone who checks in at breakfast and then wants to add their sleep at
 * lunchtime must not be told they already checked in.
 *
 * COALESCE on update means a field omitted from a later submission keeps its earlier
 * value rather than being blanked. Clearing a value therefore needs an explicit null,
 * which the caller must decide to send — the common case of "I am adding water" does not
 * silently erase this morning's mood.
 */
export async function upsertCheckIn(
  organizationId: string,
  customerId: string,
  checkinDate: string,
  input: CheckInInput,
): Promise<CheckIn> {
  const row = await queryOne<CheckInRow>(
    `INSERT INTO daily_checkins
       (organization_id, customer_id, checkin_date, mood, sleep_quality,
        sleep_minutes, water_glasses, notes)
     VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8)
     ON CONFLICT (organization_id, customer_id, checkin_date) DO UPDATE
        SET mood          = COALESCE(EXCLUDED.mood,          daily_checkins.mood),
            sleep_quality = COALESCE(EXCLUDED.sleep_quality, daily_checkins.sleep_quality),
            sleep_minutes = COALESCE(EXCLUDED.sleep_minutes, daily_checkins.sleep_minutes),
            water_glasses = COALESCE(EXCLUDED.water_glasses, daily_checkins.water_glasses),
            notes         = COALESCE(EXCLUDED.notes,         daily_checkins.notes)
     RETURNING ${COLUMNS}`,
    [
      organizationId,
      customerId,
      checkinDate,
      input.mood ?? null,
      input.sleepQuality ?? null,
      input.sleepMinutes ?? null,
      input.waterGlasses ?? null,
      input.notes ?? null,
    ],
  );
  return toCheckIn(row!);
}

export async function findCheckIn(
  organizationId: string,
  customerId: string,
  checkinDate: string,
): Promise<CheckIn | null> {
  const row = await queryOne<CheckInRow>(
    `SELECT ${COLUMNS} FROM daily_checkins
      WHERE organization_id = $1 AND customer_id = $2 AND checkin_date = $3::date`,
    [organizationId, customerId, checkinDate],
  );
  return row ? toCheckIn(row) : null;
}

export async function listCheckInsInRange(
  organizationId: string,
  customerId: string,
  from: string,
  to: string,
): Promise<CheckIn[]> {
  const rows = await query<CheckInRow>(
    `SELECT ${COLUMNS} FROM daily_checkins
      WHERE organization_id = $1 AND customer_id = $2
        AND checkin_date BETWEEN $3::date AND $4::date
      ORDER BY checkin_date`,
    [organizationId, customerId, from, to],
  );
  return rows.map(toCheckIn);
}

/**
 * Consecutive days, ending yesterday, with neither a completion nor a check-in.
 *
 * Feeds the SUSTAINED_ABSENCE signal. Today is excluded because the day is not over —
 * counting it would flag every customer who simply has not practised yet this morning.
 *
 * Counted in SQL rather than by fetching rows and looping: the generated date series is
 * bounded (14 days) and doing it here avoids pulling a fortnight of activity per
 * customer into memory for a consultant's dashboard listing every one of them.
 */
export async function consecutiveSilentDays(
  organizationId: string,
  customerId: string,
  timezone: string,
  lookbackDays = 14,
): Promise<number> {
  const row = await queryOne<{ silent: number }>(
    `WITH today AS (
       SELECT (now() AT TIME ZONE $3)::date AS d
     ),
     days AS (
       SELECT generate_series((SELECT d FROM today) - $4::int, (SELECT d FROM today) - 1, '1 day')::date AS day
     ),
     activity AS (
       SELECT day,
              EXISTS (
                SELECT 1 FROM daily_activities a
                 WHERE a.organization_id = $1 AND a.customer_id = $2
                   AND a.scheduled_for = day AND a.status = 'COMPLETED'
              ) OR EXISTS (
                SELECT 1 FROM daily_checkins c
                 WHERE c.organization_id = $1 AND c.customer_id = $2
                   AND c.checkin_date = day
              ) AS active
         FROM days
     )
     SELECT COUNT(*)::int AS silent
       FROM activity
      WHERE day > COALESCE((SELECT MAX(day) FROM activity WHERE active), '-infinity'::date)`,
    [organizationId, customerId, timezone, lookbackDays],
  );
  return row?.silent ?? 0;
}
