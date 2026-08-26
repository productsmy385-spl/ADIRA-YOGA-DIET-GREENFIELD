"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { endTenantSession, readTenantSession } from "@/server/auth/session";
import { homePathForRole } from "@/server/authorization/roles";
import {
  completeSignIn,
  requestSignInCode,
  verifySignInCode,
  type AvailableMembership,
} from "@/server/auth/sign-in";

/**
 * Server actions for the sign-in flow.
 *
 * These are the HTTP boundary. Everything they do about *who* someone is lives in
 * `sign-in.ts`; what these add is request context, form parsing, and the user-facing
 * wording — which is deliberately vague on the failure paths, for the reasons ADR-012
 * gives.
 */

/**
 * The caller's address, for rate limiting and the audit trail.
 *
 * `x-forwarded-for` is a client-supplied header and is trivially spoofed in general.
 * Behind Railway's proxy the LAST entry is the one Railway itself appended and is the
 * only trustworthy one — taking the first, which is the usual snippet, takes whatever the
 * client put there and makes the per-IP rate limit meaningless.
 */
async function requestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  const headerList = await headers();

  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded
    ? (forwarded.split(",").pop()?.trim() ?? null)
    : headerList.get("x-real-ip");

  return { ip: ip || null, userAgent: headerList.get("user-agent") };
}

export interface SignInState {
  step: "EMAIL" | "CODE" | "CHOOSE";
  email?: string;
  memberships?: AvailableMembership[];
  error?: string;
  notice?: string;
}

export async function requestCodeAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const context = await requestContext();

  const result = await requestSignInCode({ email, ...context });

  if (!result.ok) {
    if (result.reason === "INVALID_EMAIL") {
      return { step: "EMAIL", email, error: "Enter a valid email address." };
    }

    return {
      step: "EMAIL",
      email,
      error: `Too many attempts. Try again in ${Math.ceil(
        result.retryAfterSeconds / 60,
      )} minutes.`,
    };
  }

  /*
   * The same message whether or not an account exists.
   *
   * "If that address has an account" is doing real work — it is true in both cases, and
   * it sets the expectation that no email may arrive without implying which case this
   * was. Saying "we sent you a code" would be a lie half the time, and "no account found"
   * would be the enumeration leak this whole path is shaped to avoid.
   */
  return {
    step: "CODE",
    email,
    notice: "If that address has an account, a six-digit code is on its way. It expires in 5 minutes.",
  };
}

export async function verifyCodeAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const context = await requestContext();

  if (!/^\d{6}$/.test(code)) {
    return { step: "CODE", email, error: "Enter the six-digit code from your email." };
  }

  const result = await verifySignInCode({ email, code, ...context });

  if (!result.ok) {
    const message: Record<string, string> = {
      INCORRECT: "That code is not correct.",
      EXPIRED: "That code has expired. Request a new one.",
      EXHAUSTED: "Too many incorrect attempts. Request a new code.",
      NOT_ALLOWED: "This account cannot sign in. Contact your organisation.",
      RATE_LIMITED: "Too many attempts. Try again shortly.",
    };
    return { step: "CODE", email, error: message[result.reason] ?? "Sign-in failed." };
  }

  if (result.kind === "CHOOSE_ORGANIZATION") {
    return { step: "CHOOSE", email, memberships: result.memberships };
  }

  /*
   * Sent to the role's OWN home, resolved from the session that was just established —
   * never from anything the form supplied.
   *
   * `completeSignIn` has already written the session row, so `readTenantSession` is
   * reading a verified server-side identity. A TRAINER lands on `/trainer`, a STAFF on
   * `/staff`, an ADMIN on `/admin`, a member on `/dashboard`. Sending everyone to
   * `/dashboard` and letting them navigate was how a trainer's first impression of the
   * product became a page built for customers.
   *
   * redirect() throws, so nothing after it runs. It must be outside any try/catch that
   * would swallow the control-flow exception.
   */
  redirect(await homeForCurrentSession());
}

export async function chooseOrganizationAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const organizationId = String(formData.get("organizationId") ?? "").trim();
  const context = await requestContext();

  const result = await completeSignIn({ email, organizationId, ...context });

  if (!result.ok) {
    return {
      step: "EMAIL",
      error: "That selection is no longer valid. Please sign in again.",
    };
  }

  redirect(await homeForCurrentSession());
}

/**
 * Where the just-authenticated caller belongs.
 *
 * Reads the session back rather than trusting anything from the sign-in form. The role is
 * a server-side fact by this point; taking it from a posted field would let a caller pick
 * their own landing page, which is not itself an escalation — every destination re-guards
 * — but is exactly the habit ADR-004 exists to prevent.
 *
 * Falls back to the member dashboard if the session cannot be read, which should be
 * unreachable directly after a successful sign-in and is the least-privileged answer.
 */
async function homeForCurrentSession(): Promise<string> {
  const session = await readTenantSession();
  return session ? homePathForRole(session.role) : "/dashboard";
}

export async function signOutAction(): Promise<void> {
  await endTenantSession();
  redirect("/sign-in");
}
