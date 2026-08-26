/**
 * Organizations — the tenant root.
 *
 * Reads here are mostly *unscoped by nature*: an organization is the scope, so there is
 * no outer tenant to scope it to. That makes this the one repository where a careless
 * export genuinely can hand a caller another tenant's row, so each function below states
 * who is allowed to call it.
 */

import { query, queryOne } from "@/server/db/pool";
import type { OrganizationStatusValue } from "@/server/db/types";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatusValue;
  timezone: string;
  locale: string;
  /** Present only for callers entitled to see it — see `findOrganizationById`. */
  joinCode?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatusValue;
  timezone: string;
  locale: string;
  join_code: string | null;
  created_at: Date;
  updated_at: Date;
}

const PUBLIC_COLUMNS = `id, name, slug, status, timezone, locale, created_at, updated_at`;

function toOrganization(row: Omit<OrganizationRow, "join_code">): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    timezone: row.timezone,
    locale: row.locale,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Load an organization by id.
 *
 * `join_code` is deliberately NOT selected. It is the credential that lets a stranger
 * queue a PENDING account against this tenant, so it is fetched only by
 * `getJoinCode`, which staff-facing code calls explicitly. Selecting it here "because
 * it is on the row anyway" is how it ends up serialised into a page payload.
 */
export async function findOrganizationById(id: string): Promise<Organization | null> {
  const row = await queryOne<Omit<OrganizationRow, "join_code">>(
    `SELECT ${PUBLIC_COLUMNS} FROM organizations WHERE id = $1`,
    [id],
  );
  return row ? toOrganization(row) : null;
}

export async function findOrganizationBySlug(slug: string): Promise<Organization | null> {
  const row = await queryOne<Omit<OrganizationRow, "join_code">>(
    `SELECT ${PUBLIC_COLUMNS} FROM organizations WHERE slug = $1`,
    [slug.trim().toLowerCase()],
  );
  return row ? toOrganization(row) : null;
}

/**
 * Resolve a join code to its organization.
 *
 * Matches only ACTIVE organizations: a suspended or closed tenant must not accept new
 * self-registrations, and filtering in SQL means no caller can forget to check.
 *
 * The caller must treat a miss and a hit as indistinguishable to the client, or this
 * becomes an oracle for guessing join codes.
 */
export async function findOrganizationByJoinCode(
  joinCode: string,
): Promise<Organization | null> {
  const row = await queryOne<Omit<OrganizationRow, "join_code">>(
    `SELECT ${PUBLIC_COLUMNS}
       FROM organizations
      WHERE join_code = $1
        AND status = 'ACTIVE'`,
    [joinCode.trim()],
  );
  return row ? toOrganization(row) : null;
}

/**
 * Read the join code. ORG_OWNER and platform-owner surfaces only.
 *
 * Separated from the row read so that showing an organization never carries its join
 * code by default, and so that every place the code is exposed is one grep away.
 */
export async function getJoinCode(organizationId: string): Promise<string | null> {
  const row = await queryOne<{ join_code: string | null }>(
    `SELECT join_code FROM organizations WHERE id = $1`,
    [organizationId],
  );
  return row?.join_code ?? null;
}

export async function updateOrganizationJoinCode(
  organizationId: string,
  joinCode: string | null,
): Promise<void> {
  await queryOne(
    `UPDATE organizations SET join_code = $2, updated_at = now() WHERE id = $1`,
    [organizationId, joinCode],
  );
}

export interface NewOrganization {
  name: string;
  slug: string;
  timezone?: string;
  locale?: string;
  joinCode?: string | null;
}

/**
 * Create an organization. PLATFORM domain only — there is no tenant-facing path that
 * creates a tenant, by design (ADR-001).
 *
 * `join_code` defaults to NULL, meaning self-registration is closed until the tenant
 * turns it on deliberately. 001_foundation.sql makes the same choice for the same
 * reason: a default that opens a signup route is a default nobody remembers making.
 */
export async function createOrganization(
  organization: NewOrganization,
): Promise<Organization> {
  const row = await queryOne<Omit<OrganizationRow, "join_code">>(
    `INSERT INTO organizations (name, slug, timezone, locale, join_code)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PUBLIC_COLUMNS}`,
    [
      organization.name.trim(),
      organization.slug.trim().toLowerCase(),
      organization.timezone ?? "Asia/Kolkata",
      organization.locale ?? "en",
      organization.joinCode ?? null,
    ],
  );

  if (!row) throw new Error("createOrganization: insert returned no row");
  return toOrganization(row);
}

export async function setOrganizationStatus(
  id: string,
  status: OrganizationStatusValue,
): Promise<Organization | null> {
  const row = await queryOne<Omit<OrganizationRow, "join_code">>(
    `UPDATE organizations SET status = $2 WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`,
    [id, status],
  );
  return row ? toOrganization(row) : null;
}

/**
 * List every organization. PLATFORM domain only.
 *
 * This function returns rows belonging to every tenant, which is correct for the
 * platform-owner console and catastrophic anywhere else. It is not exported through any
 * tenant-facing service, and it must not be.
 */
export async function listAllOrganizations(limit = 100): Promise<Organization[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);

  const rows = await query<Omit<OrganizationRow, "join_code">>(
    `SELECT ${PUBLIC_COLUMNS} FROM organizations ORDER BY created_at DESC LIMIT $1`,
    [safeLimit],
  );
  return rows.map(toOrganization);
}

/**
 * Per-organization headline counts for the platform console.
 *
 * One grouped query rather than a count per organization: the N+1 version is invisible
 * with three tenants and the reason the page takes four seconds with three hundred.
 */
export interface OrganizationSummary extends Organization {
  userCount: number;
  customerCount: number;
}

export async function listOrganizationSummaries(
  limit = 100,
): Promise<OrganizationSummary[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);

  const rows = await query<
    Omit<OrganizationRow, "join_code"> & { user_count: string; customer_count: string }
  >(
    `SELECT o.id, o.name, o.slug, o.status, o.timezone, o.locale,
            o.created_at, o.updated_at,
            count(u.id)::text                                             AS user_count,
            count(u.id) FILTER (WHERE u.role IN ('USER', 'CUSTOMER'))::text           AS customer_count
       FROM organizations o
       LEFT JOIN users u ON u.organization_id = o.id
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT $1`,
    [safeLimit],
  );

  return rows.map((row) => ({
    ...toOrganization(row),
    userCount: Number(row.user_count),
    customerCount: Number(row.customer_count),
  }));
}
