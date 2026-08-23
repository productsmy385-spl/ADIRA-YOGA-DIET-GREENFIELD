import type { PoolClient } from "pg";

import { transaction } from "@/server/db/pool";

/**
 * Bulk member insert (Phase 13).
 *
 * A separate module from `users.ts` because a bulk import is a genuinely different write.
 * `createUser` inserts one row and lets a unique violation propagate — correct for a form
 * where the collision IS the answer. An import of three hundred rows must instead survive
 * collisions, report exactly which ones collided, and still be atomic.
 *
 * ONE TRANSACTION, AND THAT IS THE WHOLE POINT.
 *
 * Row-at-a-time inserts across three hundred round trips leave a half-imported
 * organization behind whenever the connection drops in the middle, and the operator has
 * no way to tell which rows landed. Their only recourse is to re-upload the same file and
 * hope the duplicate handling is right. Here the import either happens or it does not.
 *
 * `ON CONFLICT DO NOTHING` rather than catching 23505: inside a transaction a constraint
 * violation aborts the whole transaction, so catching it per row would need a SAVEPOINT
 * per row and would give up the single statement entirely. Conflicts are then identified
 * by SUBTRACTION — whatever did not come back in RETURNING was already there.
 */

/** One row that passed validation and is ready to insert. */
export interface ImportCandidate {
  /** Already normalised to lower case by the validator; the CHECK constraint requires it. */
  email: string;
  fullName: string;
  phone: string | null;
  locale: string;
}

export interface ImportResult {
  created: { id: string; email: string }[];
  /** Emails that already belonged to a member of this organization. */
  alreadyExisted: string[];
}

/**
 * How many rows one import may carry.
 *
 * Not a performance guess — a bound on the damage a single request can do, and a number
 * the UI can state before the operator uploads a file that will be refused. Three hundred
 * is comfortably above a real studio's roster and far below anything that would hold a
 * transaction open long enough to matter.
 */
export const MAX_IMPORT_ROWS = 300;

/**
 * Rows per INSERT statement.
 *
 * PostgreSQL caps a statement at 65535 bound parameters and this binds six per row, so
 * the ceiling is around ten thousand. Chunking well below it keeps a single statement's
 * plan small and means MAX_IMPORT_ROWS can rise later without rediscovering the limit.
 */
const CHUNK = 100;

async function insertChunk(
  client: PoolClient,
  organizationId: string,
  role: string,
  chunk: readonly ImportCandidate[],
): Promise<{ id: string; email: string }[]> {
  const values: unknown[] = [];
  const tuples = chunk.map((candidate, index) => {
    const base = index * 6;
    values.push(
      organizationId,
      candidate.email,
      candidate.fullName,
      role,
      candidate.phone,
      candidate.locale,
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::tenant_role, $${base + 5}, $${base + 6})`;
  });

  /*
   * Status is not a parameter. Imported members are INVITED, always — an import creates
   * accounts for people who have not yet proved they control the address, and
   * TENANT_SESSION_SELECT refuses a session to anything but ACTIVE. Making it settable
   * would put "activate three hundred accounts" one flag away from a spreadsheet.
   */
  const result = await client.query<{ id: string; email: string }>(
    `INSERT INTO users (organization_id, email, full_name, role, phone, locale)
     VALUES ${tuples.join(", ")}
     ON CONFLICT ON CONSTRAINT users_email_unique_per_org DO NOTHING
     RETURNING id, email`,
    values,
  );

  return result.rows;
}

/**
 * Insert every candidate, atomically.
 *
 * `organizationId` comes from the session and is bound into every row — an import cannot
 * name its own tenant (ADR-004). `role` is decided by the service after `canAssignRole`;
 * this function does not check rank, for the same reason `createUser` does not.
 */
export async function insertImportedMembers(
  organizationId: string,
  role: string,
  candidates: readonly ImportCandidate[],
): Promise<ImportResult> {
  if (candidates.length === 0) return { created: [], alreadyExisted: [] };
  if (candidates.length > MAX_IMPORT_ROWS) {
    throw new Error(`An import may contain at most ${MAX_IMPORT_ROWS} rows.`);
  }

  return transaction(async (client) => {
    const created: { id: string; email: string }[] = [];

    for (let start = 0; start < candidates.length; start += CHUNK) {
      const rows = await insertChunk(
        client,
        organizationId,
        role,
        candidates.slice(start, start + CHUNK),
      );
      created.push(...rows);
    }

    const createdEmails = new Set(created.map((row) => row.email));
    const alreadyExisted = candidates
      .map((candidate) => candidate.email)
      .filter((email) => !createdEmails.has(email));

    return { created, alreadyExisted };
  });
}
