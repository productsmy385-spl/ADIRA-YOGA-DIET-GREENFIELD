"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requestOwnerSignInCode, verifyOwnerSignInCode } from "@/server/auth/sign-in";

/**
 * Platform-domain sign-in actions.
 *
 * A separate file from the tenant sign-in actions, and separate functions underneath —
 * not a `domain` parameter on the existing ones. The tables, the cookie, the signing
 * secret, and the consequences of a mistake are all different (ADR-001, ADR-011), and a
 * shared implementation with a branch is precisely the shape that lets a tenant slip into
 * the platform domain.
 *
 * This is NOT the parallel authentication system the brief forbids. The mechanism is the
 * same OTP flow, the same tokens module, the same session policy — what differs is which
 * identity domain it authenticates against, which is the boundary the product is built on.
 */

async function requestContext() {
  const headerList = await headers();

  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded
    ? (forwarded.split(",").pop()?.trim() ?? null)
    : headerList.get("x-real-ip");

  return { ip: ip || null, userAgent: headerList.get("user-agent") };
}

export interface OwnerSignInState {
  step: "EMAIL" | "CODE";
  email?: string;
  error?: string;
  notice?: string;
}

export async function requestOwnerCodeAction(
  _previous: OwnerSignInState,
  formData: FormData,
): Promise<OwnerSignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const context = await requestContext();

  const result = await requestOwnerSignInCode({ email, ...context });

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
   * Identical wording whether or not the address is a platform account.
   *
   * This matters more here than anywhere else in the product: "this address is a platform
   * owner" is the single most valuable fact an attacker could confirm, because that
   * account administers every tenant.
   */
  return {
    step: "CODE",
    email,
    notice: "If that address has a platform account, a six-digit code is on its way.",
  };
}

export async function verifyOwnerCodeAction(
  _previous: OwnerSignInState,
  formData: FormData,
): Promise<OwnerSignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const context = await requestContext();

  if (!/^\d{6}$/.test(code)) {
    return { step: "CODE", email, error: "Enter the six-digit code from your email." };
  }

  const result = await verifyOwnerSignInCode({ email, code, ...context });

  if (!result.ok) {
    const message: Record<string, string> = {
      INCORRECT: "That code is not correct.",
      EXPIRED: "That code has expired. Request a new one.",
      EXHAUSTED: "Too many incorrect attempts. Request a new code.",
      NOT_ALLOWED: "This account cannot sign in.",
      RATE_LIMITED: "Too many attempts. Try again shortly.",
    };
    return { step: "CODE", email, error: message[result.reason] ?? "Sign-in failed." };
  }

  redirect("/super-admin");
}
