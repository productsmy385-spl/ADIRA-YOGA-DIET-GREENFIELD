"use server";

import { redirect } from "next/navigation";

import { currentClerkIdentity, revokeCurrentClerkSession } from "@/server/auth/clerk";
import { requestMeta } from "@/server/auth/request-meta";
import { endTenantSession } from "@/server/auth/session";
import { completeSignIn } from "@/server/auth/sign-in";
import { homePathForRole, normaliseRole } from "@/server/authorization/roles";

/**
 * Server actions for the sign-in flow (ADR-015).
 *
 * Proving identity is Clerk's <SignIn>. These cover what follows it: choosing an
 * organization when an address has several, and signing out of both sessions.
 */

export interface ChooseState {
  error?: string;
}

export async function chooseOrganizationAction(
  _previous: ChooseState,
  formData: FormData,
): Promise<ChooseState> {
  const identity = await currentClerkIdentity();
  if (!identity) redirect("/sign-in");

  // A CHOICE, validated against the live identity's own accounts inside completeSignIn —
  // never trusted as a scope (ADR-004).
  const organizationId = String(formData.get("organizationId") ?? "").trim();
  const result = await completeSignIn(identity, organizationId, await requestMeta());

  if (!result.ok) {
    return { error: "That selection is no longer valid. Please choose again." };
  }

  redirect(homePathForRole(normaliseRole(result.role)));
}

/**
 * Sign out of Adira AND Clerk.
 *
 * Adira's session first: it is the one every guard reads, so ending it is what actually
 * removes access. The Clerk session is ended after so the next visitor on this browser is
 * asked to prove their identity again, rather than being silently re-admitted by
 * /auth/continue.
 */
export async function signOutAction(): Promise<void> {
  await endTenantSession();
  await revokeCurrentClerkSession();
  redirect("/sign-in");
}

/**
 * From the no-access page: drop the Clerk session so a different address can be used.
 * There is no Adira session to end — that is why the person is on that page.
 */
export async function switchAccountAction(formData?: FormData): Promise<void> {
  await revokeCurrentClerkSession();
  // A fixed whitelist, never a posted URL — an open redirect on a sign-in page is a
  // phishing primitive.
  const target = formData?.get("returnTo") === "platform" ? "/super-admin/sign-in" : "/sign-in";
  redirect(target);
}
