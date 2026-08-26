import { query, queryOne, transaction } from "@/server/db/pool";
import type { AccountStatusValue } from "@/server/db/types";
import { normaliseRole, type StoredTenantRole, type TenantRole } from "@/server/authorization/roles";

/**
 * Organization-wide member ADMINISTRATION.
 *
 * The other half of ADR-013. `caseload.ts` answers "whose practice may I read" and is
 * assignment-scoped; this file answers "whom may I administer" and is organization-wide.
 *
 * THE SHARP EDGE
 *
 * `listMembers` is the one member query in the system that is deliberately org-wide, so
 * it is the one place where a careless join re-opens everything ADR-013 closed. It selects
 * identity, role, status, and an assignment count — and nothing else. No adherence, no
 * check-ins, no activity counts, no attention signals. A single extra column here would
 * hand every admin a summary of every member's practice while every other control still
 * looked correct.
 *
 * If a future change needs a health figure on this screen, it does not belong on this
 * query: it belongs behind `resolveMemberAccess`, per member.
 */

export interface MemberSummary {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: TenantRole;
  storedRole: StoredTenantRole;
  status: AccountStatusValue;
  /** How many admins this member is assigned to. A count, never who or what they see. */
  assignmentCount: number;
  createdAt: Date;
  lastSeenAt: Date | null;
}

interface MemberRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: StoredTenantRole;
  status: AccountStatusValue;
  assignment_count: number;
  created_at: Date;
  last_seen_at: Date | null;
}

function toMember(row: MemberRow): MemberSummary {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    role: normaliseRole(row.role),
    storedRole: row.role,
    status: row.status,
    assignmentCount: Number(row.assignment_count),
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}

export interface ListMembersOptions {
  /**
   * Which population to list.
   *
   *   MEMBERS  people receiving care — USER, and the CUSTOMER tombstone.
   *   STAFF    everyone delivering it — ADMIN, TRAINER, STAFF, and ORG_OWNER.
   *   ADMINS   organisation ADMINISTRATORS only. Narrower than STAFF, and the distinction
   *            is load-bearing: the platform console acts on this list with
   *            `setAdminStatusAction`, which refuses any row that is not ADMIN or
   *            ORG_OWNER. Feeding it the wider STAFF list renders Suspend buttons beside
   *            trainers that silently do nothing.
   *   ALL      no role filter.
   */
  kind?: "MEMBERS" | "STAFF" | "ADMINS" | "ALL";
  status?: AccountStatusValue;
  limit?: number;
}

/**
 * Every member of the organization, for administration.
 *
 * `organizationId` is the leading predicate and comes from the session (ADR-004). There is
 * no variant of this function that omits it.
 */
export async function listMembers(
  organizationId: string,
  options: ListMembersOptions = {},
): Promise<MemberSummary[]> {
  const conditions = ["u.organization_id = $1"];
  const params: unknown[] = [organizationId];

  /*
   * MEMBERS means "people receiving care", STAFF means "people delivering it".
   *
   * TRAINER and STAFF belong to the second group, and adding them here is what makes them
   * visible to administration at all — a role the roster cannot list is a role nobody can
   * find, suspend or audit.
   *
   * Both member labels are matched because ADR-013 keeps CUSTOMER as a tombstone; the
   * same applies to ORG_OWNER on the staff side. `listCaseload` matches the same member
   * pair, and the two must agree or somebody is administrable on one page and invisible
   * on another.
   */
  const kind = options.kind ?? "MEMBERS";
  if (kind === "MEMBERS") conditions.push(`u.role IN ('USER', 'CUSTOMER')`);
  if (kind === "STAFF") {
    conditions.push(`u.role IN ('ADMIN', 'ORG_OWNER', 'TRAINER', 'STAFF')`);
  }
  if (kind === "ADMINS") conditions.push(`u.role IN ('ADMIN', 'ORG_OWNER')`);

  if (options.status) {
    params.push(options.status);
    conditions.push(`u.status = $${params.length}`);
  }

  const safeLimit = Math.min(Math.max(Math.trunc(options.limit ?? 200), 1), 500);
  params.push(safeLimit);

  const rows = await query<MemberRow>(
    `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.status,
            u.created_at, u.last_seen_at,
            (SELECT count(*) FROM consultant_assignments ca
              WHERE ca.organization_id = u.organization_id
                AND ca.customer_id = u.id
                AND ca.ended_at IS NULL)::int AS assignment_count
       FROM users u
      WHERE ${conditions.join(" AND ")}
      ORDER BY u.full_name
      LIMIT $${params.length}`,
    params,
  );

  return rows.map(toMember);
}

/** One member, for administration. Identity and status only — never health data. */
export async function findMember(
  organizationId: string,
  memberId: string,
): Promise<MemberSummary | null> {
  const row = await queryOne<MemberRow>(
    `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.status,
            u.created_at, u.last_seen_at,
            (SELECT count(*) FROM consultant_assignments ca
              WHERE ca.organization_id = u.organization_id
                AND ca.customer_id = u.id
                AND ca.ended_at IS NULL)::int AS assignment_count
       FROM users u
      WHERE u.organization_id = $1 AND u.id = $2`,
    [organizationId, memberId],
  );
  return row ? toMember(row) : null;
}

/** How many admins can still sign in to this organization. */
export async function countActiveAdmins(organizationId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM users
      WHERE organization_id = $1
        AND role IN ('ADMIN', 'ORG_OWNER')
        AND status = 'ACTIVE'`,
    [organizationId],
  );
  return Number(row?.count ?? 0);
}

export type StatusChangeResult =
  | { ok: true; member: MemberSummary }
  | { ok: false; reason: "NOT_FOUND" | "LAST_ACTIVE_ADMIN" };

/**
 * Change a member's status, refusing to remove the organization's last active admin.
 *
 * ADR-013 Q3. The guarantee used to belong to `users_one_org_owner_idx`; dropping that
 * index moves it here, and here it must be race-safe.
 *
 * WHY THIS IS ONE STATEMENT AND NOT A CHECK FOLLOWED BY AN UPDATE
 *
 * Two admins suspending each other at the same moment both read "two active admins" and
 * both proceed, leaving the organization with none. A check-then-write passes a sequential
 * test and fails under concurrency, which is the worst combination — it looks proven.
 *
 * The count is therefore re-asserted inside the UPDATE's own WHERE clause, evaluated by
 * PostgreSQL against the row versions the statement actually sees. A concurrent
 * transaction that would take the count to zero matches no row and changes nothing. The
 * surrounding transaction plus `FOR UPDATE` on the admin rows serialises the two attempts
 * so the second sees the first's effect.
 *
 * `superAdminOverride` exists because platform-level recovery must remain possible when an
 * organization has locked itself out.
 */
export async function setMemberStatus(params: {
  organizationId: string;
  memberId: string;
  status: AccountStatusValue;
  superAdminOverride?: boolean;
}): Promise<StatusChangeResult> {
  const { organizationId, memberId, status, superAdminOverride = false } = params;

  // Statuses that leave the account able to hold a session. Only a move OUT of these can
  // strand an organization, so only those need the guard.
  const stillActive = status === "ACTIVE";

  return transaction(async (client) => {
    const target = await client.query<{ role: StoredTenantRole; status: AccountStatusValue }>(
      `SELECT role, status FROM users
        WHERE organization_id = $1 AND id = $2
        FOR UPDATE`,
      [organizationId, memberId],
    );

    if (target.rowCount === 0) return { ok: false as const, reason: "NOT_FOUND" as const };

    const isAdmin = normaliseRole(target.rows[0].role) === "ADMIN";
    const wasActive = target.rows[0].status === "ACTIVE";
    const needsGuard = isAdmin && wasActive && !stillActive && !superAdminOverride;

    if (needsGuard) {
      /*
       * Lock every active admin row in this organization before counting.
       *
       * Without FOR UPDATE the count is a snapshot: a concurrent transaction suspending a
       * different admin is invisible, both see two, both commit, and the organization is
       * left with zero. Locking makes the second attempt wait for the first and then see
       * its result.
       */
      const admins = await client.query<{ id: string }>(
        `SELECT id FROM users
          WHERE organization_id = $1
            AND role IN ('ADMIN', 'ORG_OWNER')
            AND status = 'ACTIVE'
          FOR UPDATE`,
        [organizationId],
      );

      if ((admins.rowCount ?? 0) <= 1) {
        return { ok: false as const, reason: "LAST_ACTIVE_ADMIN" as const };
      }
    }

    await client.query(`UPDATE users SET status = $3 WHERE organization_id = $1 AND id = $2`, [
      organizationId,
      memberId,
      status,
    ]);

    const updated = await client.query<MemberRow>(
      `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.status,
              u.created_at, u.last_seen_at, 0::int AS assignment_count
         FROM users u
        WHERE u.organization_id = $1 AND u.id = $2`,
      [organizationId, memberId],
    );

    return { ok: true as const, member: toMember(updated.rows[0]) };
  });
}

/** Assign a member to an admin. Administrative, so organization-wide. */
export async function createAssignment(
  organizationId: string,
  adminId: string,
  memberId: string,
): Promise<void> {
  // ON CONFLICT against the partial unique index makes re-assigning a no-op rather than an
  // error, so an admin clicking twice does not see a constraint violation.
  await query(
    `INSERT INTO consultant_assignments (organization_id, consultant_id, customer_id)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [organizationId, adminId, memberId],
  );
}

/** End an assignment. History is kept — the row is closed, never deleted. */
export async function endAssignment(
  organizationId: string,
  adminId: string,
  memberId: string,
): Promise<void> {
  await query(
    `UPDATE consultant_assignments SET ended_at = now()
      WHERE organization_id = $1
        AND consultant_id = $2
        AND customer_id = $3
        AND ended_at IS NULL`,
    [organizationId, adminId, memberId],
  );
}
