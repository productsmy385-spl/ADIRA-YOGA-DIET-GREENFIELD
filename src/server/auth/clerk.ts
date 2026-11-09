import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";

import { env } from "@/lib/env";

import { verifiedPrimaryEmailOf } from "./clerk-email";

/**
 * The Clerk boundary (ADR-015).
 *
 * Clerk answers ONE question for Adira: "has this browser proved control of this email
 * address?" Everything after that — which accounts the address has, whether they may enter,
 * which organization, what role — is Adira's, read from PostgreSQL, exactly as it was when
 * the proof was an emailed OTP. This module is the only one that reads Clerk users or calls
 * Clerk's Backend API; the sign-in pages use `auth()` only to ask "is there a Clerk user?",
 * and nothing else in the codebase sees more than a `ClerkIdentity`.
 *
 * Clerk's session is NOT Adira's session. A verified Clerk identity is turned into an
 * Adira tenant or platform session by `sign-in.ts`, and every guard keeps reading that —
 * so suspension, idle expiry, the two-domain cookie split (ADR-001, ADR-011) and the
 * organization chooser (ADR-012) all keep working unchanged.
 */

export interface ClerkIdentity {
  clerkUserId: string;
  /** The Clerk session, so sign-out can end it alongside Adira's own. */
  clerkSessionId: string | null;
  /** Lowercased, and present only if Clerk has VERIFIED it. */
  verifiedEmail: string | null;
}

/** The Clerk identity on this request, or null if Clerk has no signed-in user. */
export async function currentClerkIdentity(): Promise<ClerkIdentity | null> {
  const { userId, sessionId } = await auth();
  if (!userId) return null;

  const user = await currentUser();
  return {
    clerkUserId: userId,
    clerkSessionId: sessionId ?? null,
    verifiedEmail: user ? verifiedPrimaryEmailOf(user) : null,
  };
}

/** End the Clerk session, if any. Failure is swallowed: Adira's session is already gone. */
export async function revokeCurrentClerkSession(): Promise<void> {
  try {
    const { sessionId } = await auth();
    if (!sessionId) return;
    const client = await clerkClient();
    await client.sessions.revokeSession(sessionId);
  } catch (error) {
    console.error("[auth] Clerk session revoke failed", error instanceof Error ? error.message : "");
  }
}

/**
 * End EVERY Clerk session of the signed-in Clerk user — for "sign out everywhere".
 *
 * Revoking only Adira's sessions is not enough: a lost device still holding a live Clerk
 * session would be re-admitted silently by /auth/continue. Returns false if Clerk could
 * not be reached, so the caller can say so rather than claim a clean sign-out.
 */
export async function revokeAllClerkSessionsForCurrentUser(): Promise<boolean> {
  try {
    const { userId } = await auth();
    if (!userId) return true;
    const client = await clerkClient();
    const { data } = await client.sessions.getSessionList({ userId, status: "active" });
    await Promise.all(data.map((s) => client.sessions.revokeSession(s.id)));
    return true;
  } catch (error) {
    console.error("[auth] Clerk revoke-all failed", error instanceof Error ? error.message : "");
    return false;
  }
}

export type InvitationResult = { ok: true } | { ok: false };

/**
 * Ask Clerk to email an invitation (the FlowDine OS flow).
 *
 * The local INVITED row is what grants access; this email is only how the person learns
 * about it. So a failure here never undoes the account — the caller reports it and the
 * person can still sign in with the address at /sign-in.
 *
 * `ignoreExisting` because inviting someone who already has a Clerk account (a member of
 * another studio) is normal here, not an error. The link lands on /sign-up, which hosts
 * Clerk's <SignUp> so it can consume the invitation ticket.
 */
export async function sendClerkInvitations(emails: readonly string[]): Promise<InvitationResult> {
  if (emails.length === 0) return { ok: true };

  const redirectUrl = new URL("/sign-up", env.APP_URL).toString();
  const params = emails.map((emailAddress) => ({
    emailAddress,
    redirectUrl,
    notify: true,
    ignoreExisting: true,
  }));

  try {
    const client = await clerkClient();
    // Bulk for imports: one request rather than up to MAX_IMPORT_ROWS, which would trip
    // Clerk's Backend API rate limit partway through and leave the rest uninvited.
    if (params.length === 1) await client.invitations.createInvitation(params[0]);
    else await client.invitations.createInvitationBulk(params);
    return { ok: true };
  } catch (error) {
    // The message only — Clerk errors carry the request, not the secret key.
    console.error("[auth] Clerk invitation failed", error instanceof Error ? error.message : "");
    return { ok: false };
  }
}
