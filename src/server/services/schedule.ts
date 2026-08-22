/**
 * Turning an assignment into dated activities.
 *
 * Pure calendar arithmetic, deliberately separated from persistence: this is where the
 * bugs live. Off-by-one on a week boundary, or a DST shift silently moving a date, is
 * invisible in review and produces a customer whose Tuesday practice is marked missed.
 *
 * WHAT `dayOfWeek` MEANS HERE — read this before changing anything
 *
 * `dayOfWeek` is the day WITHIN THE PROGRAMME WEEK (1–7), where **day 1 is the weekday
 * the programme started on**. It is NOT the ISO weekday, despite the column name.
 *
 * The alternative — treating 1 as Monday — was rejected because it back-dates. A
 * customer starting a programme on Wednesday would have week 1's Monday and Tuesday fall
 * in the past, and the nightly sweep would immediately mark them MISSED. Their first
 * experience of the product would be two failures they could not have avoided
 * (`USER-JOURNEYS.md` J4 flags exactly this).
 *
 * So day 1 is always the start day. A programme is a sequence of days from when you
 * begin, which is also how a consultant describes it out loud.
 *
 * DATES, NOT TIMESTAMPS
 *
 * Everything here works on calendar dates in UTC. Adherence is computed per DAY in the
 * organisation's timezone (`docs/METRICS.md`), and a date has no timezone — so adding
 * days to a UTC midnight can never be shifted by a DST transition. Doing this arithmetic
 * on local `Date` objects is how a schedule loses or repeats a day twice a year.
 */

export interface ScheduleItemInput {
  /** Stable id of the assignment_item this activity comes from. */
  readonly id: string;
  readonly weekNumber: number;
  /** 1–7, where 1 is the programme's start day. See the note above. */
  readonly dayOfWeek: number;
  readonly sequence: number;
}

export interface ScheduledActivity<T extends ScheduleItemInput = ScheduleItemInput> {
  readonly item: T;
  /** Calendar date, `YYYY-MM-DD`. */
  readonly scheduledFor: string;
}

/** Parse `YYYY-MM-DD` into a UTC-midnight Date. Throws on anything else. */
export function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Expected a YYYY-MM-DD date, received "${value}".`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`"${value}" is not a real date.`);
  }
  // Guards against 2026-02-30, which `Date` silently rolls forward to 2 March.
  if (formatDate(date) !== value) {
    throw new Error(`"${value}" is not a real date.`);
  }
  return date;
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Format a `DATE` column read back from PostgreSQL.
 *
 * **Do not use `toISOString()` for this.** node-postgres parses a DATE into a JS `Date`
 * at LOCAL midnight, and `toISOString()` converts to UTC — so on any machine east of
 * Greenwich, `2026-09-01` reads back as `2026-08-31`. The whole schedule appears shifted
 * by a day, and the direction depends on where the server is, which is how this survives
 * a code review.
 *
 * Reading the local components is correct precisely because the value was constructed
 * from them. Where the SQL can do it instead — `to_char(col, 'YYYY-MM-DD')` — prefer
 * that; this exists for the cases where it cannot.
 */
export function formatDateColumn(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
  // setUTCDate handles month and year rollover, and cannot be perturbed by DST because
  // the underlying instant is UTC midnight.
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * The offset in days from the programme start for a given position.
 *
 * week 1 day 1 → 0. week 2 day 1 → 7. week 1 day 7 → 6.
 */
export function dayOffset(weekNumber: number, dayOfWeek: number): number {
  return (weekNumber - 1) * 7 + (dayOfWeek - 1);
}

export interface GenerateScheduleInput<T extends ScheduleItemInput> {
  /** `YYYY-MM-DD`. */
  readonly startsOn: string;
  readonly durationWeeks: number;
  readonly items: readonly T[];
}

/**
 * Expand an assignment's items into dated activities.
 *
 * Items positioned beyond `durationWeeks` are **dropped, not clamped**. Clamping would
 * silently pile a five-week programme's extra work onto the final day of a four-week
 * assignment; dropping is wrong in a way somebody notices, which is the better failure.
 *
 * Returns them ordered by date then sequence — the order a customer sees their day.
 */
export function generateSchedule<T extends ScheduleItemInput>(
  input: GenerateScheduleInput<T>,
): ScheduledActivity<T>[] {
  if (input.durationWeeks < 1) {
    throw new Error("An assignment must run for at least one week.");
  }

  const start = parseDate(input.startsOn);

  return input.items
    .filter((item) => item.weekNumber >= 1 && item.weekNumber <= input.durationWeeks)
    .filter((item) => item.dayOfWeek >= 1 && item.dayOfWeek <= 7)
    .map((item) => ({
      item,
      scheduledFor: formatDate(addDays(start, dayOffset(item.weekNumber, item.dayOfWeek))),
    }))
    .sort(
      (a, b) =>
        a.scheduledFor.localeCompare(b.scheduledFor) || a.item.sequence - b.item.sequence,
    );
}

/** The last date an assignment covers, inclusive. */
export function scheduleEndDate(startsOn: string, durationWeeks: number): string {
  return formatDate(addDays(parseDate(startsOn), durationWeeks * 7 - 1));
}

/**
 * Which activities a paused assignment should schedule: none.
 *
 * `docs/METRICS.md` requires that a paused plan cannot accumulate missed activities —
 * a customer on agreed holiday must not return to a wall of failure. Expressed here as
 * a function rather than a comment so the rule has one home and the caller cannot forget
 * which statuses generate work.
 */
export function generatesSchedule(status: string): boolean {
  return status === "ACTIVE";
}
