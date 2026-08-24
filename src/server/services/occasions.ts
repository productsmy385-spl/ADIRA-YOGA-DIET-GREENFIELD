import { query } from "@/server/db/pool";
import { isUniqueViolation } from "@/server/db/unique-violation";
import type { NotificationKindValue } from "@/server/db/types";

/**
 * Birthdays, anniversaries, and festivals.
 *
 * Run nightly. Three properties matter more than the greeting itself:
 *
 *   IDEMPOTENT   The job may run twice — a retry, an overlapping cron, a manual trigger.
 *                Three birthday messages is worse than none: it is visibly broken in a way
 *                that reaches the member. `occasion_key` plus a partial unique index makes
 *                a duplicate impossible at the database rather than unlikely in the code.
 *
 *   SCOPED       Every query carries `organization_id`. A greeting is still member data in
 *                the sense that it names a person, and one tenant's job must never touch
 *                another's rows.
 *
 *   RESPECTFUL OF STATUS   Only ACTIVE members are greeted. Sending "happy birthday" to a
 *                suspended account is at best odd and at worst tells someone their access
 *                was withdrawn in the same week as their birthday.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It makes no claim about anybody's health, and it sends nothing outside the product —
 * these are in-app notifications. Outbound mail for greetings would need the transactional
 * email path that does not exist yet, and a birthday is not worth inventing one for.
 */

/** A member due a greeting today. */
export interface DueGreeting {
  organizationId: string;
  userId: string;
  fullName: string;
  kind: Extract<NotificationKindValue, "BIRTHDAY" | "ANNIVERSARY" | "FESTIVAL">;
  /** Stable per recipient per day, so a re-run collides rather than duplicates. */
  occasionKey: string;
  title: string;
  body: string | null;
}

/**
 * Whose birthday or anniversary falls on `today`?
 *
 * The year is ignored on purpose — an anniversary recurs, and comparing the whole date
 * would match only the original one. The `EXTRACT` comparison is what the expression
 * indexes in migration 010 were built for.
 *
 * 29 February is handled by the database, not by us: a member born on a leap day simply
 * does not match in a non-leap year. Greeting them on the 28th or the 1st would be
 * choosing for them, and neither choice is obviously right.
 */
export async function birthdaysAndAnniversariesOn(today: string): Promise<DueGreeting[]> {
  const rows = await query<{
    organization_id: string;
    id: string;
    full_name: string;
    kind: "BIRTHDAY" | "ANNIVERSARY";
  }>(
    `SELECT u.organization_id, u.id, u.full_name, 'BIRTHDAY' AS kind
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
      WHERE u.status = 'ACTIVE'
        AND o.status = 'ACTIVE'
        AND u.date_of_birth IS NOT NULL
        AND EXTRACT(MONTH FROM u.date_of_birth) = EXTRACT(MONTH FROM $1::date)
        AND EXTRACT(DAY   FROM u.date_of_birth) = EXTRACT(DAY   FROM $1::date)

      UNION ALL

     SELECT u.organization_id, u.id, u.full_name, 'ANNIVERSARY' AS kind
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
      WHERE u.status = 'ACTIVE'
        AND o.status = 'ACTIVE'
        AND u.wedding_anniversary IS NOT NULL
        AND EXTRACT(MONTH FROM u.wedding_anniversary) = EXTRACT(MONTH FROM $1::date)
        AND EXTRACT(DAY   FROM u.wedding_anniversary) = EXTRACT(DAY   FROM $1::date)`,
    [today],
  );

  return rows.map((row) => ({
    organizationId: row.organization_id,
    userId: row.id,
    fullName: row.full_name,
    kind: row.kind,
    occasionKey: `${row.kind}:${today}`,
    title:
      row.kind === "BIRTHDAY"
        ? "Happy birthday"
        : "Happy anniversary",
    body:
      row.kind === "BIRTHDAY"
        ? "Wishing you a calm and steady year ahead."
        : "Wishing you both a happy anniversary.",
  }));
}

/**
 * Festivals an organisation observes today, expanded to its active members.
 *
 * `observed_on` is a real date rather than a (month, day) pair because most Indian
 * festivals move against the Gregorian calendar — Diwali is not a fixed day, so a
 * month/day rule would be wrong every year but one. Each year is its own row.
 */
export async function festivalGreetingsOn(today: string): Promise<DueGreeting[]> {
  const rows = await query<{
    organization_id: string;
    id: string;
    full_name: string;
    festival_id: string;
    name: string;
    greeting: string | null;
  }>(
    `SELECT u.organization_id, u.id, u.full_name,
            f.id AS festival_id, f.name, f.greeting
       FROM organization_festivals f
       JOIN organizations o ON o.id = f.organization_id AND o.status = 'ACTIVE'
       JOIN users u
         ON u.organization_id = f.organization_id
        AND u.status = 'ACTIVE'
      WHERE f.observed_on = $1::date`,
    [today],
  );

  return rows.map((row) => ({
    organizationId: row.organization_id,
    userId: row.id,
    fullName: row.full_name,
    kind: "FESTIVAL" as const,
    // Keyed by the festival row, not by its name: two festivals on one day each get their
    // own greeting, and renaming one later cannot collide with an already-sent message.
    occasionKey: `FESTIVAL:${row.festival_id}`,
    title: row.name,
    body: row.greeting,
  }));
}

export interface GreetingResult {
  created: number;
  duplicatesSkipped: number;
  failed: number;
}

/**
 * Write the greetings, skipping any that already exist.
 *
 * Inserted one at a time and deliberately not in a single transaction. A batch would mean
 * one bad row — a member deleted between the SELECT and the INSERT — discarding every
 * other greeting that night. Each is independent, and a failure is counted rather than
 * thrown so the job completes for everybody else.
 *
 * The duplicate is caught from the index rather than pre-checked with a SELECT, because a
 * check-then-insert races: two concurrent runs both find nothing and both insert.
 */
export async function deliverGreetings(due: readonly DueGreeting[]): Promise<GreetingResult> {
  let created = 0;
  let duplicatesSkipped = 0;
  let failed = 0;

  for (const greeting of due) {
    try {
      const inserted = await query<{ id: string }>(
        `INSERT INTO notifications
           (organization_id, recipient_id, kind, title, body, occasion_key, channels)
         VALUES ($1, $2, $3, $4, $5, $6, ARRAY['IN_APP']::notification_channel[])
         RETURNING id`,
        [
          greeting.organizationId,
          greeting.userId,
          greeting.kind,
          greeting.title,
          greeting.body,
          greeting.occasionKey,
        ],
      );
      if (inserted.length > 0) created += 1;
    } catch (error) {
      if (isUniqueViolation(error, "notifications_occasion_once_idx")) {
        duplicatesSkipped += 1;
        continue;
      }
      // Logged and counted, never rethrown: one member's greeting failing must not stop
      // the rest of the organisation's.
      console.error("[occasions] greeting failed", {
        kind: greeting.kind,
        userId: greeting.userId,
      });
      failed += 1;
    }
  }

  return { created, duplicatesSkipped, failed };
}

/** Everything due today, for the nightly job. */
export async function runDailyGreetings(today: string): Promise<GreetingResult> {
  const [personal, festivals] = await Promise.all([
    birthdaysAndAnniversariesOn(today),
    festivalGreetingsOn(today),
  ]);

  return deliverGreetings([...personal, ...festivals]);
}
