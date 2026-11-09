import { sendClerkInvitations, type InvitationResult } from "./clerk";

import { recordAudit } from "@/server/repositories/audit-logs";

/**
 * Send invitation emails for accounts that already exist as INVITED, and audit it.
 *
 * Every path that creates an INVITED account calls this — adding a member, importing
 * members, approving an access request, provisioning an administrator. One helper so the
 * audit shape is identical and a new creation path has one obvious thing to call.
 *
 * Counts in the audit row, never addresses: the account rows already hold those.
 */
export async function inviteAndAudit(
  emails: string | readonly string[],
  actor: {
    organizationId: string;
    actorDomain: "TENANT" | "PLATFORM";
    actorId: string;
    actorLabel: string;
    resourceId?: string;
  },
): Promise<InvitationResult> {
  const list = typeof emails === "string" ? [emails] : emails;
  if (list.length === 0) return { ok: true };

  const result = await sendClerkInvitations(list);

  await recordAudit({
    organizationId: actor.organizationId,
    actorDomain: actor.actorDomain,
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    action: "invitation.send",
    resourceType: actor.resourceId ? "user" : undefined,
    resourceId: actor.resourceId,
    outcome: result.ok ? "SUCCESS" : "FAILURE",
    metadata: { count: list.length, provider: "clerk" },
  });

  return result;
}
