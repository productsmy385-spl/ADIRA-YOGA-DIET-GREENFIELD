import { query, queryOne } from "@/server/db/pool";
import type { ReportKindValue, ReportStatusValue } from "@/server/db/types";

/**
 * Reading generated reports.
 *
 * A report is a statement about a period that has CLOSED, and `payload` holds the figures
 * frozen at generation time. This module therefore only reads — it never recomputes.
 * Recomputing on view would let last week's numbers move because someone edited an
 * activity since, and a weekly report whose contents change is not a report.
 *
 * Generation belongs to the job queue (roadmap Phase 11) and is not implemented. Until it
 * is, these functions correctly return nothing, and the surfaces above them say so rather
 * than inventing figures.
 *
 * SCOPING
 *
 * `listReportsForMember` is member data and must be behind `resolveMemberAccess` when an
 * admin calls it. `listOrganizationReports` returns organisation-level rows only —
 * `customer_id IS NULL` — which are aggregate and carry no individual's record.
 */

export interface Report {
  id: string;
  customerId: string | null;
  kind: ReportKindValue;
  periodStart: string;
  periodEnd: string;
  status: ReportStatusValue;
  payload: Record<string, unknown>;
  generatedAt: Date | null;
  createdAt: Date;
}

interface ReportRow {
  id: string;
  customer_id: string | null;
  kind: ReportKindValue;
  period_start: string;
  period_end: string;
  status: ReportStatusValue;
  payload: Record<string, unknown>;
  generated_at: Date | null;
  created_at: Date;
}

const COLUMNS = `
  id, customer_id, kind, period_start::text AS period_start,
  period_end::text AS period_end, status, payload, generated_at, created_at
`;

function toReport(row: ReportRow): Report {
  return {
    id: row.id,
    customerId: row.customer_id,
    kind: row.kind,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
    payload: row.payload,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
  };
}

/**
 * One member's reports.
 *
 * MEMBER DATA. A caller acting on somebody else's behalf must have passed
 * `resolveMemberAccess` first — this function takes the ids it is given and does not
 * decide who may read them.
 */
export async function listReportsForMember(
  organizationId: string,
  customerId: string,
  limit = 20,
): Promise<Report[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);

  const rows = await query<ReportRow>(
    `SELECT ${COLUMNS} FROM reports
      WHERE organization_id = $1 AND customer_id = $2
      ORDER BY period_end DESC, created_at DESC
      LIMIT $3`,
    [organizationId, customerId, safeLimit],
  );
  return rows.map(toReport);
}

/**
 * Organisation-level reports only.
 *
 * `customer_id IS NULL` is the whole of the scoping: these are aggregates over the
 * organisation and belong to nobody in particular, so an admin may read them without an
 * assignment. Dropping that predicate would turn this into an unscoped read of every
 * member's report, which is exactly what ADR-013 forbids.
 */
export async function listOrganizationReports(
  organizationId: string,
  limit = 20,
): Promise<Report[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);

  const rows = await query<ReportRow>(
    `SELECT ${COLUMNS} FROM reports
      WHERE organization_id = $1 AND customer_id IS NULL
      ORDER BY period_end DESC, created_at DESC
      LIMIT $2`,
    [organizationId, safeLimit],
  );
  return rows.map(toReport);
}

/** One report, scoped. Returns null across tenants — the row never leaves PostgreSQL. */
export async function findReport(
  organizationId: string,
  reportId: string,
): Promise<Report | null> {
  const row = await queryOne<ReportRow>(
    `SELECT ${COLUMNS} FROM reports WHERE organization_id = $1 AND id = $2`,
    [organizationId, reportId],
  );
  return row ? toReport(row) : null;
}
