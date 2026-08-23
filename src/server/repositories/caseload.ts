import { query } from "@/server/db/pool";
import { isLegacyOrganizationOwner, type TenantActor } from "@/server/authorization/roles";
import {
  assessAttention,
  reportedCompletionRate,
  tally,
  type AttentionResult,
} from "@/server/services/metrics";

/**
 * The consultant's caseload, with the triage signal (Phase 8).
 *
 * ADR-002 IS ENFORCED HERE, IN THE QUERY.
 *
 * `ADMIN` is assignment-scoped: it reaches the customers in `consultant_assignments` and
 * no others. `ORG_OWNER` has organisation-wide reach. That distinction is applied as a
 * JOIN rather than as a filter over a full result set — an admin's query never retrieves
 * an unassigned customer's row at all.
 *
 * That matters beyond tidiness. Fetching everyone and filtering afterwards means the
 * rows were read, so a logging change, an error path, or a future refactor that moves
 * the filter can leak them. Not selecting them cannot.
 *
 * The aggregates are computed in SQL over a bounded window. Pulling a fortnight of
 * activity per customer into memory to count it would make a consultant with forty
 * customers wait on forty round trips.
 */

export interface CaseloadEntry {
  customerId: string;
  fullName: string;
  email: string;
  status: string;
  hasActivePlan: boolean;
  planName: string | null;
  /** 0–1, or null when nothing has resolved this week. Never 0 for "no data". */
  currentRate: number | null;
  previousRate: number | null;
  missedThisWeek: number;
  lastActivityOn: string | null;
  attention: AttentionResult;
}

interface CaseloadRow {
  customer_id: string;
  full_name: string;
  email: string;
  status: string;
  plan_name: string | null;
  has_active_plan: boolean;
  days_since_assigned: number | null;
  ever_completed: boolean;
  flagged: boolean;
  cur_completed: number;
  cur_missed: number;
  cur_skipped: number;
  prev_completed: number;
  prev_missed: number;
  prev_skipped: number;
  consecutive_low_wellbeing: number;
  silent_days: number;
  last_activity_on: string | null;
}

/**
 * The caseload is MEMBER DATA, not an administrative member list.
 *
 * It carries adherence, missed counts, and attention signals, so it is assignment-scoped
 * under ADR-013: an ADMIN sees the members assigned to them and no others. The
 * organization-wide list of *identities* an admin may administer is a different query and
 * lives in the member-administration path.
 *
 * `orgWide` is therefore NOT `role === "ADMIN"`. It is the transitional grandfather
 * clause and nothing else — a pre-migration ORG_OWNER whose assignments have not yet been
 * seeded by migration 007. Replacing the old `viewerRole === "ORG_OWNER"` with
 * `viewerRole === "ADMIN"` would have been the one-line widening ADR-013 exists to
 * prevent, and would have silently handed every admin every member's adherence data.
 */
export async function listCaseload(actor: TenantActor): Promise<CaseloadEntry[]> {
  const organizationId = actor.organizationId;
  const viewerId = actor.userId;
  const orgWide = isLegacyOrganizationOwner(actor);

  const rows = await query<CaseloadRow>(
    `WITH tz AS (
       SELECT timezone FROM organizations WHERE id = $1
     ),
     today AS (
       SELECT (now() AT TIME ZONE (SELECT timezone FROM tz))::date AS d
     ),
     visible AS (
       SELECT u.id, u.full_name, u.email, u.status
         FROM users u
        WHERE u.organization_id = $1
          AND u.role = 'CUSTOMER'
          AND (
            $2::boolean
            OR EXISTS (
              SELECT 1 FROM consultant_assignments ca
               WHERE ca.organization_id = $1
                 AND ca.customer_id = u.id
                 AND ca.consultant_id = $3
                 AND ca.ended_at IS NULL
            )
          )
     ),
     plan AS (
       SELECT DISTINCT ON (a.customer_id)
              a.customer_id, a.name, a.status,
              ((SELECT d FROM today) - a.starts_on) AS days_since_assigned
         FROM assignments a
        WHERE a.organization_id = $1
        ORDER BY a.customer_id,
                 (a.status = 'ACTIVE') DESC,
                 a.created_at DESC
     ),
     acts AS (
       SELECT da.customer_id,
              COUNT(*) FILTER (
                WHERE da.status = 'COMPLETED'
                  AND da.scheduled_for > (SELECT d FROM today) - 7) AS cur_completed,
              COUNT(*) FILTER (
                WHERE da.status = 'MISSED'
                  AND da.scheduled_for > (SELECT d FROM today) - 7) AS cur_missed,
              COUNT(*) FILTER (
                WHERE da.status = 'SKIPPED'
                  AND da.scheduled_for > (SELECT d FROM today) - 7) AS cur_skipped,
              COUNT(*) FILTER (
                WHERE da.status = 'COMPLETED'
                  AND da.scheduled_for > (SELECT d FROM today) - 14
                  AND da.scheduled_for <= (SELECT d FROM today) - 7) AS prev_completed,
              COUNT(*) FILTER (
                WHERE da.status = 'MISSED'
                  AND da.scheduled_for > (SELECT d FROM today) - 14
                  AND da.scheduled_for <= (SELECT d FROM today) - 7) AS prev_missed,
              COUNT(*) FILTER (
                WHERE da.status = 'SKIPPED'
                  AND da.scheduled_for > (SELECT d FROM today) - 14
                  AND da.scheduled_for <= (SELECT d FROM today) - 7) AS prev_skipped,
              BOOL_OR(da.status = 'REVIEW_REQUIRED') AS flagged,
              BOOL_OR(da.status = 'COMPLETED') AS ever_completed,
              MAX(da.scheduled_for) FILTER (WHERE da.status = 'COMPLETED') AS last_activity_on
         FROM daily_activities da
        WHERE da.organization_id = $1
        GROUP BY da.customer_id
     ),
     wellbeing AS (
       -- Consecutive most-recent check-ins in the lowest band. Counted from the newest
       -- backwards: a low day a fortnight ago followed by good ones is not a decline.
       SELECT customer_id, COUNT(*) AS consecutive_low_wellbeing
         FROM (
           SELECT c.customer_id, c.checkin_date,
                  (c.mood <= 1 OR c.sleep_quality <= 1) AS low,
                  ROW_NUMBER() OVER (PARTITION BY c.customer_id ORDER BY c.checkin_date DESC) AS rn,
                  SUM(CASE WHEN (c.mood <= 1 OR c.sleep_quality <= 1) THEN 0 ELSE 1 END)
                    OVER (PARTITION BY c.customer_id ORDER BY c.checkin_date DESC
                          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS breaks
             FROM daily_checkins c
            WHERE c.organization_id = $1
         ) s
        WHERE low AND breaks = 0
        GROUP BY customer_id
     ),
     silence AS (
       SELECT v.id AS customer_id,
              (SELECT d FROM today) - 1 - COALESCE(
                GREATEST(
                  (SELECT MAX(da.scheduled_for) FROM daily_activities da
                    WHERE da.organization_id = $1 AND da.customer_id = v.id
                      AND da.status = 'COMPLETED'),
                  (SELECT MAX(c.checkin_date) FROM daily_checkins c
                    WHERE c.organization_id = $1 AND c.customer_id = v.id)
                ),
                (SELECT d FROM today) - 1
              ) AS silent_days
         FROM visible v
     )
     SELECT v.id AS customer_id, v.full_name, v.email, v.status,
            p.name AS plan_name,
            COALESCE(p.status = 'ACTIVE', false) AS has_active_plan,
            p.days_since_assigned::int AS days_since_assigned,
            COALESCE(a.ever_completed, false) AS ever_completed,
            COALESCE(a.flagged, false) AS flagged,
            COALESCE(a.cur_completed, 0)::int  AS cur_completed,
            COALESCE(a.cur_missed, 0)::int     AS cur_missed,
            COALESCE(a.cur_skipped, 0)::int    AS cur_skipped,
            COALESCE(a.prev_completed, 0)::int AS prev_completed,
            COALESCE(a.prev_missed, 0)::int    AS prev_missed,
            COALESCE(a.prev_skipped, 0)::int   AS prev_skipped,
            COALESCE(w.consecutive_low_wellbeing, 0)::int AS consecutive_low_wellbeing,
            GREATEST(COALESCE(s.silent_days, 0), 0)::int  AS silent_days,
            to_char(a.last_activity_on, 'YYYY-MM-DD') AS last_activity_on
       FROM visible v
       LEFT JOIN plan p      ON p.customer_id = v.id
       LEFT JOIN acts a      ON a.customer_id = v.id
       LEFT JOIN wellbeing w ON w.customer_id = v.id
       LEFT JOIN silence s   ON s.customer_id = v.id
      ORDER BY v.full_name`,
    [organizationId, orgWide, viewerId],
  );

  return rows.map((row) => {
    const current = tally([
      ...Array<"COMPLETED">(row.cur_completed).fill("COMPLETED"),
      ...Array<"MISSED">(row.cur_missed).fill("MISSED"),
      ...Array<"SKIPPED">(row.cur_skipped).fill("SKIPPED"),
    ]);
    const previous = tally([
      ...Array<"COMPLETED">(row.prev_completed).fill("COMPLETED"),
      ...Array<"MISSED">(row.prev_missed).fill("MISSED"),
      ...Array<"SKIPPED">(row.prev_skipped).fill("SKIPPED"),
    ]);

    const currentRate = reportedCompletionRate(current);
    const previousRate = reportedCompletionRate(previous);

    return {
      customerId: row.customer_id,
      fullName: row.full_name,
      email: row.email,
      status: row.status,
      hasActivePlan: row.has_active_plan,
      planName: row.plan_name,
      currentRate,
      previousRate,
      missedThisWeek: row.cur_missed,
      lastActivityOn: row.last_activity_on,
      // The judgement itself stays in metrics.ts, so it has one implementation and this
      // query stays a question about rows rather than about care.
      attention: assessAttention({
        hasFlaggedActivity: row.flagged,
        hasActivePlan: row.has_active_plan,
        daysSinceAssigned: row.days_since_assigned ?? 0,
        everCompletedAnything: row.ever_completed,
        consecutiveSilentDays: row.silent_days,
        missedInWindow: row.cur_missed,
        currentRate,
        previousRate,
        consecutiveLowWellbeing: row.consecutive_low_wellbeing,
      }),
    };
  });
}

/**
 * Whether a consultant may open one customer's record.
 *
 * Asked BEFORE any customer data is fetched, not after. An authorization failure and a
 * missing row must be indistinguishable to the caller, and the way to guarantee that is
 * to answer this question first and return the same 404 either way.
 */
/**
 * Does an ACTIVE assignment link this admin to this member, inside this organization?
 *
 * A pure data question, deliberately. It answers "is there a row", not "may they look" —
 * the policy lives in `canAccessMemberData` and this function must never grow an
 * `if (role === ...)`, or the decision ends up split across two layers again.
 *
 * `ended_at IS NULL` is the whole of "active". An ended assignment is history: it records
 * that a consultant once served this member, and it must not keep granting access.
 */
export async function hasActiveAssignment(
  organizationId: string,
  adminId: string,
  memberId: string,
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `SELECT ca.id FROM consultant_assignments ca
      WHERE ca.organization_id = $1
        AND ca.consultant_id = $2
        AND ca.customer_id = $3
        AND ca.ended_at IS NULL
      LIMIT 1`,
    [organizationId, adminId, memberId],
  );
  return rows.length > 0;
}

/** Is this member a real member of this organization? Used to separate 404 from 403. */
export async function isMemberOfOrganization(
  organizationId: string,
  memberId: string,
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM users WHERE id = $2 AND organization_id = $1 LIMIT 1`,
    [organizationId, memberId],
  );
  return rows.length > 0;
}
