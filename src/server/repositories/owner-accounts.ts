/**
 * Platform-owner accounts — the PLATFORM identity domain (ADR-001).
 *
 * There is no `organizationId` argument anywhere in this file, and there is no column on
 * `owner_accounts` that could hold one. That absence is the platform boundary: a
 * platform account cannot be scoped to a tenant because there is nowhere to put the
 * value.
 *
 * Note what is missing: no `createOwnerAccount`. The first platform owner is created by
 * `scripts/seed-owner.mjs`, run by a human with database access, and subsequent ones by
 * an existing platform owner through a console that will call the schema directly under
 * a platform session. Exporting a create function from a module that tenant code could
 * conceivably import is a needless invitation.
 */

import { query, queryOne } from "@/server/db/pool";
import type { AccountStatusValue } from "@/server/db/types";

export interface OwnerAccount {
  id: string;
  email: string;
  fullName: string;
  status: AccountStatusValue;
  createdAt: Date;
  updatedAt: Date;
}

interface OwnerAccountRow {
  id: string;
  email: string;
  full_name: string;
  status: AccountStatusValue;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = `id, email, full_name, status, created_at, updated_at`;

function toOwnerAccount(row: OwnerAccountRow): OwnerAccount {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findOwnerAccountById(id: string): Promise<OwnerAccount | null> {
  const row = await queryOne<OwnerAccountRow>(
    `SELECT ${COLUMNS} FROM owner_accounts WHERE id = $1`,
    [id],
  );
  return row ? toOwnerAccount(row) : null;
}

/**
 * Look up a platform account by address.
 *
 * The caller must not vary its response on whether this returns null. The platform
 * sign-in form is the highest-value target on the system, and "this address is a
 * platform owner" is precisely the fact worth confirming before an attack.
 */
export async function findOwnerAccountByEmail(email: string): Promise<OwnerAccount | null> {
  const row = await queryOne<OwnerAccountRow>(
    `SELECT ${COLUMNS} FROM owner_accounts WHERE email = $1`,
    [email.trim().toLowerCase()],
  );
  return row ? toOwnerAccount(row) : null;
}

export async function listOwnerAccounts(): Promise<OwnerAccount[]> {
  const rows = await query<OwnerAccountRow>(
    `SELECT ${COLUMNS} FROM owner_accounts ORDER BY created_at`,
  );
  return rows.map(toOwnerAccount);
}

export async function setOwnerAccountStatus(
  id: string,
  status: AccountStatusValue,
): Promise<OwnerAccount | null> {
  const row = await queryOne<OwnerAccountRow>(
    `UPDATE owner_accounts SET status = $2 WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, status],
  );
  return row ? toOwnerAccount(row) : null;
}

/**
 * How many platform accounts can still sign in.
 *
 * Called before suspending or disabling one. Removing the last ACTIVE platform owner
 * locks the operator out of their own platform with no recovery path short of a
 * database console — the seed script exists precisely because there is no way back in
 * through the application.
 */
export async function countActiveOwnerAccounts(): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT count(*)::text AS count FROM owner_accounts WHERE status = 'ACTIVE'`,
  );
  return Number(row?.count ?? 0);
}
