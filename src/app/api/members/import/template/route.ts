import { actorFromSession } from "@/server/authorization/member-access";
import { canManageOrganization } from "@/server/authorization/permissions";
import { IMPORT_TEMPLATE_HEADERS } from "@/server/services/member-import";
import { readTenantSession } from "@/server/auth/session";
import { toCsv } from "@/server/services/csv";

/**
 * A blank template with one example row.
 *
 * Generated from `IMPORT_TEMPLATE_HEADERS` rather than written out, so the file an
 * operator downloads cannot drift from the columns the parser requires — the failure
 * being an importer that rejects its own template.
 *
 * The example row is filled in because an empty file teaches nobody what `locale` wants.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await readTenantSession();
  if (!session) return new Response("Not authenticated.", { status: 401 });

  if (!canManageOrganization(actorFromSession(session)).allowed) {
    return new Response("Not permitted.", { status: 403 });
  }

  const csv = toCsv(IMPORT_TEMPLATE_HEADERS, [
    {
      email: "asha@example.com",
      full_name: "Asha Rao",
      phone: "+91 90000 00000",
      locale: "en",
    },
  ]);

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="adira-member-import-template.csv"',
      // Nothing here is per-user, but it is behind a session, and a shared cache holding
      // a response served under one is a habit worth not forming.
      "cache-control": "no-store",
    },
  });
}
