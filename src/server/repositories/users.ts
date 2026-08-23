/**
 * Tenant users and their organizations.
 *
 * Every function that reads or writes a user row takes `organizationId` as a required
 * argument sourced from the authenticated session (ADR-004) — with two deliberate
 * exceptions, both on the sign-in path, both marked and reasoned below. Those exceptions
 * exist because sign-in is the one moment when there is no session yet to take the scope
 * from, and pretending otherwise would mean inventing a scope, which is worse.
 */

import { query, queryOne } from "@/server/db/pool";
import type { AccountStatusValue, TenantRoleValue } from "@/server/db/types";

export interface TenantUser {
  id: string;
  organizationId: string;
  email: string;
  phone: string | null;
  fullName: string;
  role: TenantRoleValue;
  status: AccountStatusValue;
  locale: string;
  lastSeenAt: Date | null;
  createdAt: Date;
}

interface UserRow {
  id: string;
  organization_id: string;
  email: string;
  phone: string | null;
  full_name: string;
  role: TenantRoleValue;
  status: AccountStatusValue;
  locale: string;
  last_seen_at: Date | null;
  created_at: Date;
}

const USER_COLUMNS = `
  id, organization_id, email, phone, full_name, role, status, locale,
  last_seen_at, created_at
`;

function toUser(row: UserRow): TenantUser {
  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    phone: row.phone,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    locale: row.locale,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
  };
}

/**
 * Normalise an address to the form the `email = lower(email)` CHECK will accept.
 *
 * Applied at the repository boundary rather than trusted from the caller. A lookup that
 * forgets to lowercase does not error — it silently returns no row, which presents as
 * "this user does not exist" and is a genuinely confusing bug to chase.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findUserById(
  userId: string,
  organizationId: string,
): Promise<TenantUser | null> {
  const row = await queryOne<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = $1 AND organization_id = $2`,
    [userId, organizationId],
  );
  return row ? toUser(row) : null;
}

export async function findUserByEmail(
  email: string,
  organizationId: string,
): Promise<TenantUser | null> {
  const row = await queryOne<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE organization_id = $1 AND email = $2`,
    [organizationId, normaliseEmail(email)],
  );
  return row ? toUser(row) : null;
}

/**
 * SIGN-IN PATH EXCEPTION 1 — find every account for an address, across all tenants.
 *
 * This is the one query in the codebase that deliberately crosses tenant boundaries, and
 * it exists because `users_email_unique_per_org` makes email unique per organization
 * rather than globally: the same person can be a customer at one studio and a consultant
 * at another, and at sign-in there is no session to say which one they mean.
 *
 * Two things keep it from being a tenant-isolation hole:
 *
 *   1. Nothing it returns may reach the client before the caller has *verified a
 *      credential* for one of these accounts. Returning the list earlier would turn the
 *      sign-in form into a directory of which studios a given address belongs to.
 *      ADR-012 states this rule; `sign-in.ts` is where it is enforced.
 *
 *   2. It selects no health data and no organization detail beyond what the person must
 *      see to choose — name and slug of studios they can already prove they belong to.
 *
 * Do not reuse this function anywhere other than authentication.
 */
export async function findAccountsForEmailAcrossTenants(
  email: string,
): Promise<Array<TenantUser & { organizationName: string; organizationSlug: string }>> {
  const rows = await query<UserRow & { organization_name: string; organization_slug: string }>(
    `SELECT u.id, u.organization_id, u.email, u.phone, u.full_name, u.role, u.status,
            u.locale, u.last_seen_at, u.created_at,
            o.name AS organization_name,
            o.slug AS organization_slug
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
      WHERE u.email = $1
        AND o.status = 'ACTIVE'
      ORDER BY o.name`,
    [normaliseEmail(email)],
  );

  return rows.map((row) => ({
    ...toUser(row),
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
  }));
}

/**
 * Record that a user was seen. Cheap, and the only column it touches is advisory, so it
 * is safe to call without a transaction.
 */
export async function touchLastSeen(userId: string, organizationId: string): Promise<void> {
  await query(
    `UPDATE users SET last_seen_at = now() WHERE id = $1 AND organization_id = $2`,
    [userId, organizationId],
  );
}

export interface NewUser {
  organizationId: string;
  email: string;
  fullName: string;
  role: TenantRoleValue;
  status?: AccountStatusValue;
  phone?: string | null;
  locale?: string;
}

/**
 * Create a user.
 *
 * Defaults to INVITED, not ACTIVE. An account created by staff has not yet proved anyone
 * controls the address, and `TENANT_SESSION_SELECT` refuses a session to anything but
 * ACTIVE — so an invited account exists but cannot sign in until activation moves it.
 * Defaulting to ACTIVE here would make every invitation a live account, which is the
 * kind of default that is only noticed after it matters.
 *
 * Rank rules are NOT checked here. Whether the actor may create a user with this role is
 * `canAssignRole`'s job, in the service layer, where the actor is known. A repository
 * that silently enforced policy would make the policy invisible at the call site.
 */
export async function createUser(user: NewUser): Promise<TenantUser> {
  const row = await queryOne<UserRow>(
    `INSERT INTO users (organization_id, email, full_name, role, status, phone, locale)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${USER_COLUMNS}`,
    [
      user.organizationId,
      normaliseEmail(user.email),
      user.fullName.trim(),
      user.role,
      user.status ?? "INVITED",
      user.phone ?? null,
      user.locale ?? "en",
    ],
  );

  if (!row) throw new Error("createUser: insert returned no row");
  return toUser(row);
}

export async function setUserStatus(
  userId: string,
  organizationId: string,
  status: AccountStatusValue,
): Promise<TenantUser | null> {
  const row = await queryOne<UserRow>(
    `UPDATE users SET status = $3
      WHERE id = $1 AND organization_id = $2
      RETURNING ${USER_COLUMNS}`,
    [userId, organizationId, status],
  );
  return row ? toUser(row) : null;
}

export interface ListUsersOptions {
  role?: TenantRoleValue;
  status?: AccountStatusValue;
  limit?: number;
}

/**
 * List an organization's users.
 *
 * The optional filters are appended as bound parameters, never interpolated. The leading
 * predicate is `organization_id`, matching `users_org_role_status_idx`.
 */
export async function listUsers(
  organizationId: string,
  options: ListUsersOptions = {},
): Promise<TenantUser[]> {
  const conditions = ["organization_id = $1"];
  const params: unknown[] = [organizationId];

  if (options.role) {
    params.push(options.role);
    conditions.push(`role = $${params.length}`);
  }

  if (options.status) {
    params.push(options.status);
    conditions.push(`status = $${params.length}`);
  }

  const safeLimit = Math.min(Math.max(Math.trunc(options.limit ?? 100), 1), 500);
  params.push(safeLimit);

  const rows = await query<UserRow>(
    `SELECT ${USER_COLUMNS}
       FROM users
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT $${params.length}`,
    params,
  );

  return rows.map(toUser);
}

/** How many users an organization has, grouped by role. Used by the owner dashboards. */
export async function countUsersByRole(
  organizationId: string,
): Promise<Record<TenantRoleValue, number>> {
  const rows = await query<{ role: TenantRoleValue; count: string }>(
    `SELECT role, count(*)::text AS count
       FROM users
      WHERE organization_id = $1
      GROUP BY role`,
    [organizationId],
  );

  const counts: Record<TenantRoleValue, number> = {
    ORG_OWNER: 0,
    ADMIN: 0,
    CUSTOMER: 0,
    USER: 0,
  };
  for (const row of rows) counts[row.role] = Number(row.count);
  return counts;
}
