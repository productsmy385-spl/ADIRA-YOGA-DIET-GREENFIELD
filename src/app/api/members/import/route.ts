import { NextResponse } from "next/server";

import { actorFromSession } from "@/server/authorization/member-access";
import { canAssignRole, canManageOrganization } from "@/server/authorization/permissions";
import { candidatesFrom, previewMemberImport } from "@/server/services/member-import";
import { insertImportedMembers, MAX_IMPORT_ROWS } from "@/server/repositories/member-import";
import { readTenantSession } from "@/server/auth/session";
import { recordAudit } from "@/server/repositories/audit-logs";
import { readCsvBody } from "./body";

/**
 * Import members from a CSV.
 *
 * THE FILE IS RE-PARSED HERE. The client sends the same bytes it sent to the preview, not
 * the rows the preview returned — because a client that could post a row list could post
 * one the preview never produced, with a role, a status, or an organization of its
 * choosing. Re-deriving costs milliseconds and removes the entire category.
 *
 * Every account lands as INVITED with role USER. There is no parameter for either, so
 * "import three hundred administrators" is not one field away from a spreadsheet, and an
 * imported account cannot sign in until someone proves they control the address.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await readTenantSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const actor = actorFromSession(session);

  if (!canManageOrganization(actor).allowed) {
    await recordAudit({
      organizationId: session.organizationId,
      actorDomain: "TENANT",
      actorId: session.userId,
      actorLabel: session.email,
      action: "members.import",
      outcome: "DENIED",
      metadata: { reason: "NOT_ADMINISTRATIVE" },
    });
    return NextResponse.json(
      { error: "You do not have permission to import members." },
      { status: 403 },
    );
  }

  /*
   * Asked explicitly even though the role is fixed at USER. If the import ever gains a
   * role column, the rank rule is already the gate rather than something to remember to
   * add — and the check costs nothing today.
   */
  if (!canAssignRole(actor, "USER").allowed) {
    return NextResponse.json(
      { error: "You do not have permission to create these accounts." },
      { status: 403 },
    );
  }

  const body = await readCsvBody(request);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  const summary = previewMemberImport(body.text);

  if (summary.fileErrors.length > 0) {
    return NextResponse.json(
      { error: "That file could not be read.", fileErrors: summary.fileErrors },
      { status: 400 },
    );
  }

  const candidates = candidatesFrom(summary);

  if (candidates.length === 0) {
    return NextResponse.json(
      { error: "There are no valid rows to import." },
      { status: 400 },
    );
  }

  if (candidates.length > MAX_IMPORT_ROWS) {
    return NextResponse.json(
      {
        error: `An import may contain at most ${MAX_IMPORT_ROWS} members. Split the file and import it in parts.`,
      },
      { status: 400 },
    );
  }

  const result = await insertImportedMembers(session.organizationId, "USER", candidates);

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: "members.import",
    outcome: "SUCCESS",
    /*
     * Counts, not addresses. An audit log that lists three hundred email addresses turns
     * the log itself into a copy of the member roster, and audit rows outlive the
     * accounts they describe.
     */
    metadata: {
      created: result.created.length,
      alreadyExisted: result.alreadyExisted.length,
      skippedInvalid: summary.invalid,
      skippedDuplicate: summary.duplicates,
    },
  });

  return NextResponse.json({
    created: result.created.length,
    alreadyExisted: result.alreadyExisted,
    skippedInvalid: summary.invalid,
    skippedDuplicate: summary.duplicates,
  });
}
