import { NextResponse } from "next/server";

import { actorFromSession } from "@/server/authorization/member-access";
import { canManageOrganization } from "@/server/authorization/permissions";
import { previewMemberImport } from "@/server/services/member-import";
import { MAX_IMPORT_ROWS } from "@/server/repositories/member-import";
import { readTenantSession } from "@/server/auth/session";
import { readCsvBody, MAX_CSV_BYTES } from "../body";

/**
 * Classify a CSV without writing anything.
 *
 * §23 requires the operator to see valid rows, invalid rows and duplicates BEFORE any
 * account exists. Someone importing three hundred members needs to fix their spreadsheet
 * in one pass — an importer that stops at row 3 and makes them re-upload is one they will
 * work around by splitting the file, which is worse than the problem.
 *
 * Nothing here touches the database, so the preview cannot report which emails already
 * belong to a member. That is deliberate: the answer would be stale the moment somebody
 * else adds a member, so it is reported after the import instead of promised before it.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await readTenantSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!canManageOrganization(actorFromSession(session)).allowed) {
    return NextResponse.json(
      { error: "You do not have permission to import members." },
      { status: 403 },
    );
  }

  const body = await readCsvBody(request);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  const summary = previewMemberImport(body.text);

  return NextResponse.json({
    ...summary,
    maxRows: MAX_IMPORT_ROWS,
    maxBytes: MAX_CSV_BYTES,
    tooManyRows: summary.valid > MAX_IMPORT_ROWS,
  });
}
