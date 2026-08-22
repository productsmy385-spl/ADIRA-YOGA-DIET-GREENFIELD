/**
 * The audit trail. Append-only — there is no update function here and no update path in
 * the schema, because an audit trail that can be edited is not an audit trail.
 *
 * WHAT MUST NEVER REACH THIS TABLE
 *
 * OTP values, session tokens, passkey secrets, connection strings, or anything else a
 * reader of the table could use as a credential. `metadata` is the risky field, because
 * it accepts arbitrary JSON and "just log the whole object for debugging" is an easy
 * change to make and a hard one to notice in review. `assertNoSecrets` below turns that
 * from a convention into a check that fires in development and test.
 */

import { query } from "@/server/db/pool";
import type { IdentityDomainValue } from "@/server/db/types";

export type AuditOutcome = "SUCCESS" | "FAILURE" | "DENIED";

export interface AuditEntry {
  /** NULL for platform-level events that belong to no tenant. */
  organizationId?: string | null;

  actorDomain: IdentityDomainValue;

  /** NULL for unauthenticated events — a failed sign-in has no actor yet. */
  actorId?: string | null;

  /**
   * Denormalised label, kept so the trail stays readable after the actor row is gone.
   * An email address is appropriate here; it is already in `users`, and an audit trail
   * naming only UUIDs is one nobody reads.
   */
  actorLabel?: string | null;

  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  outcome?: AuditOutcome;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Keys whose presence in `metadata` is a bug, matched case-insensitively as substrings.
 *
 * Substring matching is deliberately blunt: `otp`, `otpCode`, `otp_value`, and
 * `userOtp` should all fail. The cost of a false positive is renaming a metadata key;
 * the cost of a false negative is a credential in a table that gets exported to
 * compliance reviewers.
 */
const FORBIDDEN_METADATA_KEYS = [
  "password",
  "secret",
  "token",
  "otp",
  "code_hash",
  "codehash",
  "credential",
  "private_key",
  "privatekey",
  "authorization",
  "cookie",
];

/**
 * Throw if metadata carries something that looks like a secret.
 *
 * Enabled outside production only. In production the priority is that the audit entry
 * gets written at all — losing the record of a security event because its metadata had
 * an unfortunate key name would be a worse outcome than the leak this guards against,
 * and the check has already had every chance to fire in development, test, and CI.
 */
export function assertNoSecrets(metadata: Record<string, unknown>): void {
  const offenders = Object.keys(metadata).filter((key) => {
    const lowered = key.toLowerCase();
    return FORBIDDEN_METADATA_KEYS.some((forbidden) => lowered.includes(forbidden));
  });

  if (offenders.length > 0) {
    throw new Error(
      `Audit metadata contains key(s) that look like secrets: ${offenders.join(", ")}. ` +
        `Audit entries record that something happened, never the credential involved ` +
        `(CLAUDE.md invariant 8). Record an identifier or a boolean instead.`,
    );
  }
}

/**
 * Write one audit entry.
 *
 * Deliberately swallows nothing: if the insert fails, the caller finds out. An audit
 * write that silently fails leaves the system looking compliant while recording nothing,
 * which is worse than a visible error. Callers that must not fail on audit problems
 * (the health probe, say) should not be writing audit entries in the first place.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  const metadata = entry.metadata ?? {};

  if (process.env.NODE_ENV !== "production") assertNoSecrets(metadata);

  await query(
    `INSERT INTO audit_logs
       (organization_id, actor_domain, actor_id, actor_label, action, resource_type,
        resource_id, outcome, metadata, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`,
    [
      entry.organizationId ?? null,
      entry.actorDomain,
      entry.actorId ?? null,
      entry.actorLabel ?? null,
      entry.action,
      entry.resourceType ?? null,
      entry.resourceId ?? null,
      entry.outcome ?? "SUCCESS",
      JSON.stringify(metadata),
      entry.ip ?? null,
      entry.userAgent ?? null,
    ],
  );
}

export interface AuditRecord {
  id: string;
  organizationId: string | null;
  actorDomain: IdentityDomainValue;
  actorId: string | null;
  actorLabel: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  outcome: AuditOutcome;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

interface AuditRow {
  id: string;
  organization_id: string | null;
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

function toRecord(row: AuditRow): AuditRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    actorDomain: row.actor_domain,
    actorId: row.actor_id,
    actorLabel: row.actor_label,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    outcome: row.outcome,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

/**
 * Read a tenant's audit trail.
 *
 * `organizationId` is required and is the leading predicate, matching
 * `audit_logs_org_time_idx`. There is deliberately no "read all organizations" variant
 * in this module — that is a platform-owner capability and belongs behind the platform
 * session, not one argument away from a tenant-facing call site (ADR-004).
 */
export async function listAuditForOrganization(
  organizationId: string,
  limit = 50,
): Promise<AuditRecord[]> {
  // Clamp rather than trust: an unbounded limit reaching SQL from a query string is how
  // a listing endpoint becomes a way to pull the whole table in one request.
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);

  const rows = await query<AuditRow>(
    `SELECT id, organization_id, actor_domain, actor_id, actor_label, action,
            resource_type, resource_id, outcome, metadata, created_at
       FROM audit_logs
      WHERE organization_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [organizationId, safeLimit],
  );

  return rows.map(toRecord);
}
