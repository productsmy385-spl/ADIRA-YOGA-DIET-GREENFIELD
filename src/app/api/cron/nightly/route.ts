import { query } from "@/server/db/pool";
import { sweepMissedActivities } from "@/server/repositories/activities";
import { runDailyGreetings } from "@/server/services/occasions";
import { enqueueMany } from "@/server/repositories/jobs";
import { cronUnauthorised, isAuthorisedCronRequest } from "@/server/http/cron-auth";
import { customersDueWeeklyReport, lastCompleteWeek } from "@/server/services/reports";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The nightly sweep, plus weekly report scheduling.
 *
 * Two things happen here, and neither does the expensive work itself:
 *
 *  1. Past-due activities become MISSED. This is the one piece of real work done inline,
 *     because it is a single UPDATE regardless of how many customers exist.
 *
 *  2. On the configured day, weekly reports are ENQUEUED — one job per customer, not one
 *     job for all of them. ADR-003 requires a job to be completable inside an HTTP
 *     request, and "generate reports for every customer in every organisation" is not.
 *     A hundred customers is a hundred small jobs the drain works through at its own
 *     pace, and one customer's failure retries alone instead of taking the batch down.
 *
 * Record the schedule in docs/RAILWAY.md when it is created.
 */

/** Monday, so the week that just ended is complete in every timezone we serve. */
const REPORT_DAY = 1;

export async function POST(request: Request) {
  if (!isAuthorisedCronRequest(request)) return cronUnauthorised();

  const missed = await sweepMissedActivities();

  const organizations = await query<{ id: string }>(
    `SELECT id FROM organizations WHERE status = 'ACTIVE'`,
  );

  let reportsQueued = 0;
  let greetingsCreated = 0;
  let greetingsSkipped = 0;

  // Weekday is evaluated per organisation, in its own timezone — a studio in Asia/Kolkata
  // and one in Europe/London do not roll over to Monday at the same instant.
  for (const org of organizations) {
    const isReportDay = await query<{ due: boolean }>(
      `SELECT EXTRACT(ISODOW FROM (now() AT TIME ZONE o.timezone))::int = $2 AS due
         FROM organizations o WHERE o.id = $1`,
      [org.id, REPORT_DAY],
    );

    /*
     * Greetings run EVERY night, per organisation, in its own timezone — birthdays do not
     * wait for report day. `runDailyGreetings` is idempotent through
     * `notifications_occasion_once_idx`, so a retried or overlapping run cannot send a
     * second "happy birthday": the duplicate collides with the index and is counted rather
     * than delivered.
     */
    const localToday = await query<{ today: string }>(
      `SELECT to_char((now() AT TIME ZONE o.timezone)::date, 'YYYY-MM-DD') AS today
         FROM organizations o WHERE o.id = $1`,
      [org.id],
    );

    if (localToday[0]) {
      const greeted = await runDailyGreetings(localToday[0].today);
      greetingsCreated += greeted.created;
      greetingsSkipped += greeted.duplicatesSkipped;
    }

    if (!isReportDay[0]?.due) continue;

    const period = await lastCompleteWeek(org.id);
    const customers = await customersDueWeeklyReport(org.id, period);

    reportsQueued += await enqueueMany(
      customers.map((customerId) => ({
        type: "report.customer-weekly",
        organizationId: org.id,
        payload: { customerId, periodStart: period.start, periodEnd: period.end },
      })),
    );
  }

  return Response.json({
    missedSwept: missed,
    organizations: organizations.length,
    reportsQueued,
    greetingsCreated,
    greetingsSkipped,
  });
}
