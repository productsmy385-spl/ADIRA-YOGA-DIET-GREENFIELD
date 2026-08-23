import { query, queryOne } from "@/server/db/pool";
import { reportedCompletionRate, tally } from "@/server/services/metrics";

/**
 * Organisation-level analytics (Phase 9).
 *
 * Every figure here is defined in `docs/METRICS.md` and computed from real rows. The
 * rules that survive from there:
 *
 *   - Undefined is not zero. A consultant with no scheduled activity has NO adherence,
 *     and the owner's dashboard must show a dash rather than rank them last.
 *   - Consultant figures are ADHERENCE OF ASSIGNED CUSTOMERS, never "performance". R5
 *     in RISKS-AND-ASSUMPTIONS: a consultant given the hardest cases will show the worst
 *     number, and presenting that as quality is both wrong and organisationally
 *     corrosive. Caseload is returned alongside so it can never be shown without it.
 */

export interface OrganizationSummary {
  totalCustomers: number;
  activeCustomers: number;
  newCustomers30d: number;
  consultants: number;
  /** 0–1, or null when nothing was scheduled organisation-wide. */
  adherence7d: number | null;
  checkIns7d: number;
  needsAttention: number;
}

export async function organizationSummary(
  organizationId: string,
): Promise<OrganizationSummary> {
  const row = await queryOne<{
    total_customers: number;
    active_customers: number;
    new_customers: number;
    consultants: number;
    completed: number;
    missed: number;
    skipped: number;
    check_ins: number;
  }>(
    `WITH tz AS (SELECT timezone FROM organizations WHERE id = $1),
     today AS (SELECT (now() AT TIME ZONE (SELECT timezone FROM tz))::date AS d)
     SELECT
       (SELECT count(*) FROM users
         WHERE organization_id = $1 AND role = 'CUSTOMER')::int AS total_customers,
       -- "Active" is an assignment PLUS engagement in 14 days. An assignment with no
       -- activity is dormant, and counting it as active flatters every other figure.
       (SELECT count(DISTINCT u.id) FROM users u
         WHERE u.organization_id = $1 AND u.role = 'CUSTOMER'
           AND EXISTS (SELECT 1 FROM assignments a
                        WHERE a.customer_id = u.id AND a.status = 'ACTIVE')
           AND (
             EXISTS (SELECT 1 FROM daily_activities da
                      WHERE da.customer_id = u.id AND da.status = 'COMPLETED'
                        AND da.scheduled_for > (SELECT d FROM today) - 14)
             OR EXISTS (SELECT 1 FROM daily_checkins c
                         WHERE c.customer_id = u.id
                           AND c.checkin_date > (SELECT d FROM today) - 14)
           ))::int AS active_customers,
       (SELECT count(*) FROM users
         WHERE organization_id = $1 AND role = 'CUSTOMER'
           AND created_at > now() - interval '30 days')::int AS new_customers,
       (SELECT count(*) FROM users
         WHERE organization_id = $1 AND role IN ('ADMIN', 'ORG_OWNER'))::int AS consultants,
       (SELECT count(*) FROM daily_activities
         WHERE organization_id = $1 AND status = 'COMPLETED'
           AND scheduled_for > (SELECT d FROM today) - 7)::int AS completed,
       (SELECT count(*) FROM daily_activities
         WHERE organization_id = $1 AND status = 'MISSED'
           AND scheduled_for > (SELECT d FROM today) - 7)::int AS missed,
       (SELECT count(*) FROM daily_activities
         WHERE organization_id = $1 AND status = 'SKIPPED'
           AND scheduled_for > (SELECT d FROM today) - 7)::int AS skipped,
       (SELECT count(*) FROM daily_checkins
         WHERE organization_id = $1
           AND checkin_date > (SELECT d FROM today) - 7)::int AS check_ins`,
    [organizationId],
  );

  const counts = tally([
    ...Array<"COMPLETED">(row?.completed ?? 0).fill("COMPLETED"),
    ...Array<"MISSED">(row?.missed ?? 0).fill("MISSED"),
    ...Array<"SKIPPED">(row?.skipped ?? 0).fill("SKIPPED"),
  ]);

  return {
    totalCustomers: row?.total_customers ?? 0,
    activeCustomers: row?.active_customers ?? 0,
    newCustomers30d: row?.new_customers ?? 0,
    consultants: row?.consultants ?? 0,
    adherence7d: reportedCompletionRate(counts),
    checkIns7d: row?.check_ins ?? 0,
    needsAttention: 0,
  };
}

export interface ConsultantLoad {
  consultantId: string;
  fullName: string;
  /** Live assignments in `consultant_assignments`. Always shown beside the rate. */
  caseload: number;
  /** Adherence of their assigned customers, 0–1, or null. NOT a quality score. */
  assignedAdherence7d: number | null;
}

/**
 * Per-consultant caseload and the adherence of the customers assigned to them.
 *
 * The naming here is load-bearing. This is not "consultant performance" and must never
 * be labelled as such in the UI — see R5. A consultant handed the most difficult
 * customers will show the lowest number, and an owner acting on that ranking would
 * punish the person doing the hardest work.
 */
export async function consultantLoads(organizationId: string): Promise<ConsultantLoad[]> {
  const rows = await query<{
    consultant_id: string;
    full_name: string;
    caseload: number;
    completed: number;
    missed: number;
    skipped: number;
  }>(
    `WITH tz AS (SELECT timezone FROM organizations WHERE id = $1),
     today AS (SELECT (now() AT TIME ZONE (SELECT timezone FROM tz))::date AS d),
     live AS (
       SELECT ca.consultant_id, ca.customer_id
         FROM consultant_assignments ca
        WHERE ca.organization_id = $1 AND ca.ended_at IS NULL
     )
     SELECT u.id AS consultant_id, u.full_name,
            (SELECT count(*) FROM live l WHERE l.consultant_id = u.id)::int AS caseload,
            COALESCE((SELECT count(*) FROM daily_activities da
                       JOIN live l ON l.customer_id = da.customer_id
                                  AND l.consultant_id = u.id
                      WHERE da.organization_id = $1 AND da.status = 'COMPLETED'
                        AND da.scheduled_for > (SELECT d FROM today) - 7), 0)::int AS completed,
            COALESCE((SELECT count(*) FROM daily_activities da
                       JOIN live l ON l.customer_id = da.customer_id
                                  AND l.consultant_id = u.id
                      WHERE da.organization_id = $1 AND da.status = 'MISSED'
                        AND da.scheduled_for > (SELECT d FROM today) - 7), 0)::int AS missed,
            COALESCE((SELECT count(*) FROM daily_activities da
                       JOIN live l ON l.customer_id = da.customer_id
                                  AND l.consultant_id = u.id
                      WHERE da.organization_id = $1 AND da.status = 'SKIPPED'
                        AND da.scheduled_for > (SELECT d FROM today) - 7), 0)::int AS skipped
       FROM users u
      WHERE u.organization_id = $1 AND u.role IN ('ADMIN', 'ORG_OWNER')
      ORDER BY u.full_name`,
    [organizationId],
  );

  return rows.map((row) => ({
    consultantId: row.consultant_id,
    fullName: row.full_name,
    caseload: row.caseload,
    assignedAdherence7d: reportedCompletionRate(
      tally([
        ...Array<"COMPLETED">(row.completed).fill("COMPLETED"),
        ...Array<"MISSED">(row.missed).fill("MISSED"),
        ...Array<"SKIPPED">(row.skipped).fill("SKIPPED"),
      ]),
    ),
  }));
}

// ---------------------------------------------------------------------------
// Platform owner — spans organisations (ADR-001)
// ---------------------------------------------------------------------------

export interface TenantSummary {
  organizationId: string;
  name: string;
  slug: string;
  status: string;
  customers: number;
  staff: number;
  activeAssignments: number;
  lastActivityAt: Date | null;
}

/**
 * Every tenant, for the platform console.
 *
 * Deliberately COUNTS ONLY. A platform owner running the service needs to see that a
 * tenant exists, how large it is, and whether it is alive — not who its customers are or
 * what their health records say. ADR-001 gives platform accounts no implicit reach into
 * tenant data, and a listing that quietly included customer names would be that reach
 * arriving through the back door.
 */
export async function listTenantSummaries(): Promise<TenantSummary[]> {
  const rows = await query<{
    organization_id: string;
    name: string;
    slug: string;
    status: string;
    customers: number;
    staff: number;
    active_assignments: number;
    last_activity_at: Date | null;
  }>(
    `SELECT o.id AS organization_id, o.name, o.slug, o.status::text AS status,
            (SELECT count(*) FROM users u
              WHERE u.organization_id = o.id AND u.role = 'CUSTOMER')::int AS customers,
            (SELECT count(*) FROM users u
              WHERE u.organization_id = o.id AND u.role IN ('ADMIN','ORG_OWNER'))::int AS staff,
            (SELECT count(*) FROM assignments a
              WHERE a.organization_id = o.id AND a.status = 'ACTIVE')::int AS active_assignments,
            (SELECT max(da.updated_at) FROM daily_activities da
              WHERE da.organization_id = o.id) AS last_activity_at
       FROM organizations o
      ORDER BY o.name`,
  );

  return rows.map((row) => ({
    organizationId: row.organization_id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    customers: row.customers,
    staff: row.staff,
    activeAssignments: row.active_assignments,
    lastActivityAt: row.last_activity_at,
  }));
}

/**
 * Platform health, for the operator.
 *
 * Queue depth and oldest queued job are here because R8 records that a stalled cron
 * drain is otherwise undetectable: schedules live in the Railway dashboard, invisible to
 * git, and if one is removed the queue simply fills in silence. Surfacing it turns an
 * invisible failure into a number somebody sees.
 */
export interface PlatformHealth {
  organizations: number;
  totalCustomers: number;
  queuedJobs: number;
  deadJobs: number;
  oldestQueuedMinutes: number | null;
}

export async function platformHealth(): Promise<PlatformHealth> {
  const row = await queryOne<{
    organizations: number;
    customers: number;
    queued: number;
    dead: number;
    oldest_minutes: number | null;
  }>(
    `SELECT
       (SELECT count(*) FROM organizations)::int AS organizations,
       (SELECT count(*) FROM users WHERE role = 'CUSTOMER')::int AS customers,
       (SELECT count(*) FROM jobs WHERE status = 'QUEUED')::int AS queued,
       (SELECT count(*) FROM jobs WHERE status = 'DEAD')::int AS dead,
       (SELECT EXTRACT(EPOCH FROM (now() - min(run_after))) / 60
          FROM jobs WHERE status = 'QUEUED' AND run_after <= now())::int AS oldest_minutes`,
  );

  return {
    organizations: row?.organizations ?? 0,
    totalCustomers: row?.customers ?? 0,
    queuedJobs: row?.queued ?? 0,
    deadJobs: row?.dead ?? 0,
    oldestQueuedMinutes: row?.oldest_minutes ?? null,
  };
}
