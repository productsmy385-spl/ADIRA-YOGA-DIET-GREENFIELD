/**
 * Wall-clock time in a named IANA timezone ↔ UTC, with no dependency.
 *
 * Sessions are entered and displayed in the ORGANISATION's timezone
 * (`organizations.timezone`), not the server's (UTC on Railway) and not the browser's —
 * a studio's 18:00 class is 18:00 in the studio, wherever its admin happens to be.
 */

function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - instant.getTime();
}

/** "2026-11-12" + "18:00" in `timeZone` → the UTC instant. Null if the input is invalid. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const naive = new Date(`${date}T${time}:00.000Z`);
  if (Number.isNaN(naive.getTime())) return null;
  // Two passes so a DST transition between the guess and the answer is accounted for.
  const first = new Date(naive.getTime() - offsetMs(naive, timeZone));
  return new Date(naive.getTime() - offsetMs(first, timeZone));
}

/** Format an instant in `timeZone`. */
export function formatInZone(
  instant: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
): string {
  return instant.toLocaleString("en-GB", { ...options, timeZone });
}
