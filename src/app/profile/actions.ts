"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireTenantSession } from "@/server/auth/guards";
import { endTenantSession } from "@/server/auth/session";
import { recordAudit } from "@/server/repositories/audit-logs";
import { revokeUserPasskey } from "@/server/repositories/passkey-credentials";
import { revokeAllTenantSessions } from "@/server/repositories/sessions";

/**
 * A member's own account controls.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * IDENTITY IS NEVER A PARAMETER HERE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Every action takes `userId` and `organizationId` from the session and nowhere else, so
 * there is no id a caller could substitute to revoke somebody else's passkey or end
 * somebody else's sessions. That is stronger than validating a submitted id, for the
 * reason `today/actions.ts` gives: a check can be forgotten when a new action is added; a
 * value that is never accepted cannot be.
 *
 * The one id that IS accepted — a passkey's database id — is scoped in the UPDATE itself.
 * `revokeUserPasskey` matches on `id AND organization_id AND user_id`, so a forged id
 * matches no row rather than touching another person's credential.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT DELIBERATELY IS NOT HERE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * No name, email or phone editing. `users` has the columns and `updateUser` does not
 * exist — and inventing one raises questions this file cannot answer alone: changing an
 * email address changes the identifier OTP is sent to, which is an account-recovery path
 * and needs verification of the new address before the old one stops working. A form that
 * wrote the column directly would be a credential-change flow with no verification step.
 *
 * So the profile shows those fields as read-only and says who can change them. See
 * `docs/` — this is recorded as a gap rather than filled with something unsafe.
 */

export async function revokePasskeyAction(formData: FormData): Promise<void> {
  const session = await requireTenantSession();

  const credentialId = String(formData.get("credentialId") ?? "");
  if (!credentialId) return;

  const revoked = await revokeUserPasskey(
    session.organizationId,
    session.userId,
    credentialId,
  );

  // Nothing matched — a stale page, or an id that was never theirs. Audit the attempt
  // either way: a failed revoke against a credential id is worth being able to see.
  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: "passkey.revoke",
    resourceType: "passkey_credential",
    resourceId: credentialId,
    outcome: revoked ? "SUCCESS" : "FAILURE",
  });

  revalidatePath("/profile");
}

/**
 * End every session for this account, including the one making the request.
 *
 * The order matters and is not interchangeable. `revokeAllTenantSessions` marks every row
 * revoked — which already includes the current session, so the caller is signed out by
 * the database before the cookie is touched. `endTenantSession` then clears the cookie so
 * the browser stops presenting a token that no longer resolves.
 *
 * Doing it the other way round would clear the cookie first and lose the ability to
 * identify the session being ended if the second step failed.
 */
export async function signOutEverywhereAction(): Promise<void> {
  const session = await requireTenantSession();

  const count = await revokeAllTenantSessions(session.userId, session.organizationId);

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: "session.revoke_all",
    resourceType: "user",
    resourceId: session.userId,
    outcome: "SUCCESS",
    metadata: { sessionsRevoked: count },
  });

  await endTenantSession();
  redirect("/sign-in");
}
