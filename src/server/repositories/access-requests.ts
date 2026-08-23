import { query, queryOne, transaction } from "@/server/db/pool";
import { isUniqueViolation } from "@/server/db/unique-violation";
import type { AccessRequestStatusValue } from "@/server/db/types";

/**
 * Access requests — someone without an account asking an admin for one.
 *
 * Deliberately NOT a `users` row in a pending state. The brief requires account status and
 * request status to stay separate, and `account_status.PENDING` ("self-registered via join
 * code, awaiting approval") is exactly the conflation it warns against. No account exists
 * until an admin approves, so a rejected request leaves nothing behind to be activated
 * later.
 *
 * There is no `requested_role` column and no argument that could carry one. Approval always
 * creates a USER; admin provisioning is a separate privileged workflow (ADR-013).
 */

export interface AccessRequest {
  id: string;
  organizationId: string;
  fullName: string;
  email: string;
  phone: string | null;
  reason: string | null;
  status: AccessRequestStatusValue;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  createdAt: Date;
}

interface RequestRow {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  reason: string | null;
  status: AccessRequestStatusValue;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  review_notes: string | null;
  created_at: Date;
}

const COLUMNS = `
  id, organization_id, full_name, email, phone, reason, status,
  reviewed_by, reviewed_at, review_notes, created_at
`;

function toRequest(row: RequestRow): AccessRequest {
  return {
    id: row.id,
    organizationId: row.organization_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    reason: row.reason,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNotes: row.review_notes,
    createdAt: row.created_at,
  };
}

export interface NewAccessRequest {
  organizationId: string;
  fullName: string;
  email: string;
  phone?: string | null;
  reason?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export type CreateResult =
  | { ok: true; request: AccessRequest }
  | { ok: false; reason: "DUPLICATE_PENDING" };

/**
 * Record a request.
 *
 * Duplicate handling is the partial unique index, not a lookup-then-insert. Two
 * submissions arriving together both find nothing and both insert; the index is what
 * actually prevents it, and catching its violation is how that outcome reaches the caller.
 *
 * `organizationId` has already been resolved from a join code server-side. It is never
 * supplied by the applicant.
 */
export async function createAccessRequest(input: NewAccessRequest): Promise<CreateResult> {
  try {
    const row = await queryOne<RequestRow>(
      `INSERT INTO access_requests
         (organization_id, full_name, email, phone, reason, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${COLUMNS}`,
      [
        input.organizationId,
        input.fullName.trim(),
        input.email.trim().toLowerCase(),
        input.phone ?? null,
        input.reason ?? null,
        input.ip ?? null,
        input.userAgent ?? null,
      ],
    );

    if (!row) throw new Error("createAccessRequest: insert returned no row");
    return { ok: true, request: toRequest(row) };
  } catch (error) {
    if (isUniqueViolation(error, "access_requests_one_pending_idx")) {
      return { ok: false, reason: "DUPLICATE_PENDING" };
    }
    throw error;
  }
}

/** This organization's requests, for the admin queue. Scope comes from the session. */
export async function listAccessRequests(
  organizationId: string,
  status?: AccessRequestStatusValue,
): Promise<AccessRequest[]> {
  const params: unknown[] = [organizationId];
  let filter = "";

  if (status) {
    params.push(status);
    filter = `AND status = $${params.length}`;
  }

  const rows = await query<RequestRow>(
    `SELECT ${COLUMNS} FROM access_requests
      WHERE organization_id = $1 ${filter}
      ORDER BY created_at DESC
      LIMIT 200`,
    params,
  );
  return rows.map(toRequest);
}

/**
 * One request, scoped to the organization.
 *
 * `organizationId` is part of the predicate rather than checked afterwards, so an admin
 * passing another tenant's request id gets null — the row never leaves PostgreSQL.
 */
export async function findAccessRequest(
  organizationId: string,
  requestId: string,
): Promise<AccessRequest | null> {
  const row = await queryOne<RequestRow>(
    `SELECT ${COLUMNS} FROM access_requests WHERE organization_id = $1 AND id = $2`,
    [organizationId, requestId],
  );
  return row ? toRequest(row) : null;
}

export async function countPendingAccessRequests(organizationId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT count(*)::text AS count FROM access_requests
      WHERE organization_id = $1 AND status = 'PENDING'`,
    [organizationId],
  );
  return Number(row?.count ?? 0);
}

export type DecisionResult =
  | { ok: true; request: AccessRequest; createdUserId?: string }
  | { ok: false; reason: "NOT_FOUND" | "ALREADY_DECIDED" };

/**
 * Approve a request and create the account, as ONE unit of work.
 *
 * The transaction is the point. Approving and then creating the user in a second statement
 * can leave a request marked APPROVED with no account behind it — a person told they have
 * access who cannot sign in, and no error anywhere to explain it.
 *
 * `status = 'PENDING'` in the UPDATE's WHERE clause makes this idempotent under
 * concurrency: two admins approving simultaneously produce one account, and the second
 * sees ALREADY_DECIDED rather than creating a duplicate.
 *
 * The account is created INVITED, never ACTIVE. Approval grants entitlement; the person
 * still has to prove they control the address through the existing OTP or passkey flow.
 */
export async function approveAccessRequest(params: {
  organizationId: string;
  requestId: string;
  reviewerId: string;
  notes?: string | null;
}): Promise<DecisionResult> {
  const { organizationId, requestId, reviewerId, notes } = params;

  return transaction(async (client) => {
    const decided = await client.query<RequestRow>(
      `UPDATE access_requests
          SET status = 'APPROVED', reviewed_by = $3, reviewed_at = now(), review_notes = $4
        WHERE organization_id = $1 AND id = $2 AND status = 'PENDING'
        RETURNING ${COLUMNS}`,
      [organizationId, requestId, reviewerId, notes ?? null],
    );

    if (decided.rowCount === 0) {
      const exists = await client.query(
        `SELECT 1 FROM access_requests WHERE organization_id = $1 AND id = $2`,
        [organizationId, requestId],
      );
      return {
        ok: false as const,
        reason: (exists.rowCount ?? 0) > 0 ? ("ALREADY_DECIDED" as const) : ("NOT_FOUND" as const),
      };
    }

    const request = toRequest(decided.rows[0]);

    /*
     * The role is a literal, not a parameter.
     *
     * Nothing the applicant submitted can influence it — there is no column to carry a
     * requested role and no variable here to hold one. Writing 'USER' inline is what makes
     * "an applicant cannot choose a privileged role" true by construction rather than by a
     * validation step somebody could remove.
     */
    const created = await client.query<{ id: string }>(
      `INSERT INTO users (organization_id, email, full_name, phone, role, status)
       VALUES ($1, $2, $3, $4, 'USER', 'INVITED')
       ON CONFLICT (organization_id, email) DO NOTHING
       RETURNING id`,
      [organizationId, request.email, request.fullName, request.phone],
    );

    return {
      ok: true as const,
      request,
      createdUserId: created.rows[0]?.id,
    };
  });
}

/** Reject a request. Creates no account, and records who decided and why. */
export async function rejectAccessRequest(params: {
  organizationId: string;
  requestId: string;
  reviewerId: string;
  notes?: string | null;
}): Promise<DecisionResult> {
  const { organizationId, requestId, reviewerId, notes } = params;

  const row = await queryOne<RequestRow>(
    `UPDATE access_requests
        SET status = 'REJECTED', reviewed_by = $3, reviewed_at = now(), review_notes = $4
      WHERE organization_id = $1 AND id = $2 AND status = 'PENDING'
      RETURNING ${COLUMNS}`,
    [organizationId, requestId, reviewerId, notes ?? null],
  );

  if (!row) {
    const existing = await findAccessRequest(organizationId, requestId);
    return { ok: false, reason: existing ? "ALREADY_DECIDED" : "NOT_FOUND" };
  }

  return { ok: true, request: toRequest(row) };
}
