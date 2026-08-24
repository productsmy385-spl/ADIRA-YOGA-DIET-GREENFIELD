import { requireRole } from "@/server/auth/guards";
import { recordAudit } from "@/server/repositories/audit-logs";
import { listMembers } from "@/server/repositories/members";
import { toCsv } from "@/server/services/csv";

/**
 * Export this organisation's members as CSV.
 *
 * ADMINISTRATIVE, so organisation-wide and needing no assignment — and therefore carrying
 * the same rule as `/admin/members`: identity and status only.
 *
 * WHAT IS DELIBERATELY NOT EXPORTED
 *
 * No activities, check-ins, adherence, plans or reports. An export is the easiest way for
 * member health data to leave the system in bulk, and the whole point of ADR-013 is that
 * administering an account is not permission to read someone's practice. A "full export"
 * would hand every admin every member's record in one click, past every control that
 * exists to prevent exactly that.
 *
 * Exporting health data, if it is ever wanted, is a different feature: per member, behind
 * `resolveMemberAccess`, and audited per row.
 */

export const dynamic = "force-dynamic";

const HEADERS = ["full_name", "email", "phone", "status", "assigned_admins", "joined"] as const;

export async function GET() {
  const session = await requireRole("ADMIN");

  const members = await listMembers(session.organizationId, { kind: "MEMBERS", limit: 500 });

  const csv = toCsv(HEADERS, [
    ...members.map((m) => ({
      full_name: m.fullName,
      email: m.email,
      phone: m.phone ?? "",
      status: m.status,
      assigned_admins: m.assignmentCount,
      joined: m.createdAt.toISOString().slice(0, 10),
    })),
  ]);

  // Bulk egress of member identities is worth a trail even though it carries no health
  // data — "who exported the member list, and when" is a question an incident asks.
  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: "members.exported",
    resourceType: "user",
    outcome: "SUCCESS",
    metadata: { rows: members.length, fields: [...HEADERS] },
  });

  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(`\uFEFF${csv}`, {
    headers: {
      // The BOM above is what makes Excel read UTF-8 rather than mangling accented names.
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${session.organizationSlug}-members-${stamp}.csv"`,
      // An export is per-request and per-actor; a cached copy served to someone else would
      // be a disclosure.
      "Cache-Control": "no-store",
    },
  });
}
