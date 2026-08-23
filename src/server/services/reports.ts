import { query, queryOne } from "@/server/db/pool";
import type { ReportKindValue } from "@/server/db/types";
import { createNotification } from "@/server/repositories/notifications";

import { completionPercent, reportedCompletionRate, tally } from "./metrics";

/**
 * Report generation (Phase 11).
 *
 * A REPORT IS A SNAPSHOT, NOT A QUERY.
 *
 * The computed figures are frozen into `reports.payload` at generation time. Recomputing
 * on every view would let last week's numbers move — because a customer marked a missed
 * activity complete, or a consultant edited a plan — and a weekly report whose contents
 * change is not a report. This is the same reasoning as ADR-009, applied to time rather
 * than to templates.
 *
 * Generation runs through the job queue, so a hundred customers is a hundred small jobs
 * rather than one long request (ADR-003).
 */

export interface CustomerWeeklyPayload {
  adherencePercent: number | null;
  yogaPercent: number | null;
  dietPercent: number | null;
  completed: number;
  missed: number;
  skipped: number;
  checkIns: number;
  /** Change in percentage points against the previous week, or null if unknowable. */
  changeVsPreviousWeek: number | null;
}

/** The Monday-to-Sunday week that ENDED before `today`, in the organisation's timezone. */
export async function lastCompleteWeek(
  organizationId: string,
): Promise<{ start: string; end: string }> {
  const row = await queryOne<{ start: string; end: string }>(
    `WITH tz AS (SELECT timezone FROM organizations WHERE id = $1),
     today AS (SELECT (now() AT TIME ZONE (SELECT timezone FROM tz))::date AS d)
     SELECT to_char(date_trunc('week', (SELECT d FROM today))::date - 7, 'YYYY-MM-DD') AS start,
            to_char(date_trunc('week', (SELECT d FROM today))::date - 1, 'YYYY-MM-DD') AS end`,
    [organizationId],
  );
  if (!row) throw new Error("Organization not found.");
  return { start: row.start, end: row.end };
}

async function countsFor(
  organizationId: string,
  customerId: string,
  from: string,
  to: string,
  kind?: "YOGA" | "DIET",
) {
  const rows = await query<{ status: string }>(
    `SELECT status FROM daily_activities
      WHERE organization_id = $1 AND customer_id = $2
        AND scheduled_for BETWEEN $3::date AND $4::date
        AND ($5::programme_kind IS NULL OR kind = $5::programme_kind)`,
    [organizationId, customerId, from, to, kind ?? null],
  );
  return tally(rows.map((r) => r.status as never));
}

/**
 * Build a customer's weekly report and store it.
 *
 * Idempotent: the unique index on (organisation, kind, period, customer) means a re-run
 * updates the existing row rather than producing a second copy of last week. That
 * matters because the drain retries, and a customer receiving two "your week" reports is
 * a bug they can see.
 */
export async function generateCustomerWeekly(
  organizationId: string,
  customerId: string,
  period: { start: string; end: string },
): Promise<{ reportId: string; payload: CustomerWeeklyPayload }> {
  const previousStart = shiftDate(period.start, -7);
  const previousEnd = shiftDate(period.end, -7);

  const [all, yoga, diet, previous, checkIns] = await Promise.all([
    countsFor(organizationId, customerId, period.start, period.end),
    countsFor(organizationId, customerId, period.start, period.end, "YOGA"),
    countsFor(organizationId, customerId, period.start, period.end, "DIET"),
    countsFor(organizationId, customerId, previousStart, previousEnd),
    queryOne<{ count: string }>(
      `SELECT count(*)::text AS count FROM daily_checkins
        WHERE organization_id = $1 AND customer_id = $2
          AND checkin_date BETWEEN $3::date AND $4::date`,
      [organizationId, customerId, period.start, period.end],
    ),
  ]);

  const current = reportedCompletionRate(all);
  const prior = reportedCompletionRate(previous);

  const payload: CustomerWeeklyPayload = {
    adherencePercent: completionPercent(all),
    // Yoga and diet are reported separately and never averaged: they fail for different
    // reasons, and a blended figure hides the recognisable case of someone practising
    // faithfully while eating badly.
    yogaPercent: completionPercent(yoga),
    dietPercent: completionPercent(diet),
    completed: all.completed,
    missed: all.missed,
    skipped: all.skipped,
    checkIns: Number(checkIns?.count ?? 0),
    // Null rather than 0 when either week has no denominator — "no change" and "we
    // cannot tell" are different statements.
    changeVsPreviousWeek:
      current === null || prior === null ? null : Math.round((current - prior) * 100),
  };

  const row = await queryOne<{ id: string }>(
    `INSERT INTO reports
       (organization_id, customer_id, kind, period_start, period_end,
        status, payload, generated_at)
     VALUES ($1, $2, 'CUSTOMER_WEEKLY', $3::date, $4::date, 'READY', $5::jsonb, now())
     ON CONFLICT (organization_id, kind, period_start,
                  COALESCE(customer_id, '00000000-0000-0000-0000-000000000000'::uuid))
     DO UPDATE SET payload = EXCLUDED.payload,
                   status = 'READY',
                   generated_at = now(),
                   error = NULL
     RETURNING id`,
    [organizationId, customerId, period.start, period.end, JSON.stringify(payload)],
  );

  return { reportId: row!.id, payload };
}

/**
 * Notify a customer that their report is ready.
 *
 * Separate from generation on purpose. A retried generation must not send a second
 * notification, so the drain calls this once, after the report has been written
 * successfully — and the notification is skipped entirely for a week in which nothing
 * was scheduled, because "here is your report: no data" is noise.
 */
export async function notifyReportReady(
  organizationId: string,
  customerId: string,
  payload: CustomerWeeklyPayload,
  period: { start: string; end: string },
): Promise<void> {
  if (payload.adherencePercent === null) return;

  await createNotification({
    organizationId,
    recipientId: customerId,
    kind: "WEEKLY_PROGRESS",
    title: "Your week in review",
    body:
      `You completed ${payload.completed} of ` +
      `${payload.completed + payload.missed + payload.skipped} activities ` +
      `(${payload.adherencePercent}%) between ${period.start} and ${period.end}.`,
    link: "/reports",
  });
}

export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Every customer who should receive a weekly report for this period.
 *
 * Restricted to those with activities in the window. A customer with no plan gets no
 * report rather than one saying nothing happened — the second is worse than silence for
 * someone who was never given anything to do.
 */
export async function customersDueWeeklyReport(
  organizationId: string,
  period: { start: string; end: string },
): Promise<string[]> {
  const rows = await query<{ customer_id: string }>(
    `SELECT DISTINCT da.customer_id
       FROM daily_activities da
      WHERE da.organization_id = $1
        AND da.scheduled_for BETWEEN $2::date AND $3::date`,
    [organizationId, period.start, period.end],
  );
  return rows.map((row) => row.customer_id);
}

export async function findReport(
  organizationId: string,
  customerId: string,
  kind: ReportKindValue,
  periodStart: string,
) {
  return queryOne<{ id: string; payload: CustomerWeeklyPayload; generated_at: Date }>(
    `SELECT id, payload, generated_at FROM reports
      WHERE organization_id = $1 AND customer_id = $2
        AND kind = $3::report_kind AND period_start = $4::date`,
    [organizationId, customerId, kind, periodStart],
  );
}

export async function listCustomerReports(organizationId: string, customerId: string) {
  return query<{
    id: string;
    period_start: string;
    period_end: string;
    payload: CustomerWeeklyPayload;
  }>(
    `SELECT id,
            to_char(period_start, 'YYYY-MM-DD') AS period_start,
            to_char(period_end, 'YYYY-MM-DD') AS period_end,
            payload
       FROM reports
      WHERE organization_id = $1 AND customer_id = $2 AND status = 'READY'
      ORDER BY period_start DESC
      LIMIT 12`,
    [organizationId, customerId],
  );
}
