import { query } from "@/server/db/pool";

import type { AuditOutcome, AuditRecord } from "./audit-logs";
import type { IdentityDomainValue } from "@/server/db/types";

/**
 * The cross-organization audit trail — a PLATFORM capability (ADR-001).
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A SEPARATE MODULE RATHER THAN A FLAG ON `listAuditForOrganization`
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `audit-logs.ts` says it plainly: there is deliberately no "read all organizations"
 * variant there, because a tenant-facing module must not carry a function that drops the
 * `organizationId` predicate. An optional argument is one forgotten parameter away from a
 * tenant call site reading every tenant's trail, and it would look correct in review.
 *
 * Putting it in its own file makes the boundary structural. Every caller of this module
 * is a platform surface, an import of it from tenant code is visible in one grep, and
 * ADR-004's rule — tenant scope comes from the session — is not weakened, because these
 * functions are not tenant-scoped at all and do not pretend to be.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS DOES AND DOES NOT EXPOSE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Audit rows record WHO did WHAT to WHICH resource — an actor, an action, a resource id,
 * an outcome. They do not carry health data: `assertNoSecrets` already refuses to record
 * secrets in metadata, and no activity, check-in or report content is written here.
 *
 * So this does not hand a platform operator member data, and it must not become a way to.
 * A resource id is an opaque identifier, and reading the record it names still requires
 * going through `canAccessMemberData`, which denies a platform actor unconditionally.
 */

interface AuditRow {
  id: string;
  organization_id: string | null;
  organization_name: string | null;
  actor_domain: IdentityDomainValue;
  actor_id: string | null;
  actor_label: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  outcome: AuditOutcome;
  metadata: Record<string, unknown>;
  created_at: Date;
}

/** An audit row with the tenant's name resolved, so the console need not join in the page. */
export interface PlatformAuditRecord extends AuditRecord {
  organizationName: string | null;
}

export interface PlatformAuditFilter {
  /** Restrict to one tenant. Omitted means every tenant. */
  organizationId?: string;
  /** Restrict to one outcome — `DENIED` is the one worth watching. */
  outcome?: AuditOutcome;
  limit?: number;
}

/**
 * The platform-wide trail, newest first.
 *
 * Filters are applied as bound parameters with a `$n IS NULL OR` guard rather than by
 * assembling SQL text, so there is no branch in which a value reaches the statement
 * unbound (ADR-005).
 */
export async function listPlatformAudit(
  filter: PlatformAuditFilter = {},
): Promise<PlatformAuditRecord[]> {
  // Clamped, not trusted: an unbounded limit arriving from a query string is how a
  // listing surface becomes a way to pull the whole table in one request.
  const safeLimit = Math.min(Math.max(Math.trunc(filter.limit ?? 100), 1), 200);

  const rows = await query<AuditRow>(
    `SELECT a.id, a.organization_id, o.name AS organization_name,
            a.actor_domain, a.actor_id, a.actor_label, a.action,
            a.resource_type, a.resource_id, a.outcome, a.metadata, a.created_at
       FROM audit_logs a
       LEFT JOIN organizations o ON o.id = a.organization_id
      WHERE ($1::uuid IS NULL OR a.organization_id = $1::uuid)
        AND ($2::text IS NULL OR a.outcome::text = $2::text)
      ORDER BY a.created_at DESC
      LIMIT $3`,
    [filter.organizationId ?? null, filter.outcome ?? null, safeLimit],
  );

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    actorDomain: row.actor_domain,
    actorId: row.actor_id,
    actorLabel: row.actor_label,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    outcome: row.outcome,
    metadata: row.metadata,
    createdAt: row.created_at,
  }));
}

/**
 * How many denials across the platform in the last `hours`.
 *
 * Surfaced on the console because a rising denial count is the signal that somebody is
 * probing for records they cannot reach — and `audit_logs_denied_idx` exists precisely to
 * make this question cheap. A number nobody looks at is an index nobody benefits from.
 */
export async function countRecentDenials(hours = 24): Promise<number> {
  const safeHours = Math.min(Math.max(Math.trunc(hours), 1), 24 * 30);

  const rows = await query<{ count: number }>(
    `SELECT count(*)::int AS count
       FROM audit_logs
      WHERE outcome = 'DENIED'
        AND created_at > now() - make_interval(hours => $1)`,
    [safeHours],
  );

  return rows[0]?.count ?? 0;
}
