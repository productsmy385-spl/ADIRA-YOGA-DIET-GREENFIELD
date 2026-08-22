import { createDeliveryAdapter, type OtpDeliveryAdapter } from "./delivery";
import { evaluateRateLimit, windowStart, type AuthAction } from "./rate-limit";
import { generateOtpCode, hashOtpCode, verifyOtpCode } from "./tokens";

import { env } from "@/lib/env";
import {
  clearAccountAttempts,
  countRecentAttempts,
  recordAttempt,
} from "@/server/repositories/auth-attempts";
import {
  createChallenge,
  findLiveChallenge,
  markVerified,
  recordFailedAttempt,
  type OtpPrincipal,
} from "@/server/repositories/otp-challenges";
import { recordAudit } from "@/server/repositories/audit-logs";
import type { OtpPurposeValue } from "@/server/db/types";

/**
 * Issuing and verifying one-time codes.
 *
 * This is the layer where the rules in docs/AUTHENTICATION.md become code: short expiry,
 * a per-challenge attempt budget, two-dimensional rate limiting, single use, hash-only
 * storage, timing-safe comparison, and an audit entry that never contains the code.
 *
 * WHAT THIS MODULE DOES NOT DO
 *
 * It does not decide whether an address has an account, and it does not shape the
 * response the client sees. Both belong to `sign-in.ts`, which must answer identically
 * whether or not the account exists (ADR-012). A principal reaching this module has
 * already been resolved, so nothing here can leak that fact — except through timing, and
 * the caller is responsible for that too.
 */

/**
 * Five minutes. docs/AUTHENTICATION.md asks for "short, single-digit minutes".
 *
 * The trade-off is real in both directions: too short and a code expires while an email
 * is still in a queue, producing support tickets and a second send; too long and a code
 * sitting in an unattended inbox stays usable. Five minutes is enough for mail delivery
 * with room to type, and the resend path exists for the rest.
 */
export const OTP_TTL_MS = 5 * 60_000;

/** Per-challenge guess budget. Small, because six digits is only a million values. */
export const OTP_MAX_ATTEMPTS = 5;

export interface IssueOtpRequest {
  principal: OtpPrincipal;
  purpose: OtpPurposeValue;
  /** The address the code is sent to. Recorded; the code is not. */
  destination: string;
  ip?: string | null;
  userAgent?: string | null;
  /** Injectable for tests. Defaults to the adapter the environment configures. */
  delivery?: OtpDeliveryAdapter;
}

export type IssueOtpResult =
  | { ok: true; expiresAt: Date }
  | { ok: false; reason: "RATE_LIMITED"; retryAfterSeconds: number }
  | { ok: false; reason: "DELIVERY_FAILED" };

function subjectFor(principal: OtpPrincipal): string {
  return principal.kind === "TENANT" ? principal.userId : principal.ownerAccountId;
}

function auditFieldsFor(principal: OtpPrincipal) {
  return principal.kind === "TENANT"
    ? { organizationId: principal.organizationId, actorDomain: "TENANT" as const, actorId: principal.userId }
    : { organizationId: null, actorDomain: "PLATFORM" as const, actorId: principal.ownerAccountId };
}

/**
 * The delivery adapter, built once and memoised.
 *
 * Construction is lazy rather than at module load because `createDeliveryAdapter` throws
 * in production when Resend is unconfigured — deliberately, so that codes can never
 * silently go to a server log. Building it at import time would turn that into a failure
 * to load the module at all, which surfaces as an opaque error on an unrelated route
 * rather than on the sign-in path that actually needs it.
 */
let defaultAdapter: OtpDeliveryAdapter | null = null;

function deliveryAdapter(): OtpDeliveryAdapter {
  defaultAdapter ??= createDeliveryAdapter({
    nodeEnv: env.NODE_ENV,
    resendApiKey: env.RESEND_API_KEY,
    fromEmail: env.OTP_FROM_EMAIL,
  });
  return defaultAdapter;
}

/**
 * Issue a code and send it.
 *
 * Order of operations is deliberate: check the limit, then create the challenge, then
 * deliver. Delivering before persisting would send a code that cannot be verified if the
 * insert then fails — the worst possible failure, because the person has a code in hand
 * that the system will reject.
 */
export async function issueOtp(request: IssueOtpRequest): Promise<IssueOtpResult> {
  const action: AuthAction = "otp.issue";
  const now = new Date();
  const subject = subjectFor(request.principal);
  const audit = auditFieldsFor(request.principal);

  // FAIL CLOSED. rate-limit.ts states the rule; this is where it is honoured. If the
  // count cannot be read, deny — a limiter that fails open under load has an off switch
  // an attacker can reach by causing load.
  let counts;
  try {
    counts = await countRecentAttempts({
      action,
      accountSubject: subject,
      ip: request.ip,
      since: windowStart(action, now),
    });
  } catch (error) {
    console.error("[otp] rate-limit count failed; denying", error);
    return { ok: false, reason: "RATE_LIMITED", retryAfterSeconds: 60 };
  }

  const decision = evaluateRateLimit(action, counts);

  if (!decision.allowed) {
    await recordAttempt({ action, accountSubject: subject, ip: request.ip, successful: false });
    await recordAudit({
      ...audit,
      action: "otp.issue",
      resourceType: "otp_challenge",
      outcome: "DENIED",
      // Note what is recorded: that a code was requested and refused, and why. Never the
      // code — there is not one yet, and there must never be one here.
      metadata: { reason: "RATE_LIMITED", limitedBy: decision.limitedBy },
      ip: request.ip,
      userAgent: request.userAgent,
    });
    return {
      ok: false,
      reason: "RATE_LIMITED",
      retryAfterSeconds: decision.retryAfterSeconds,
    };
  }

  const code = generateOtpCode();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  const challenge = await createChallenge({
    principal: request.principal,
    purpose: request.purpose,
    destination: request.destination,
    expiresAt,
    maxAttempts: OTP_MAX_ATTEMPTS,
    ip: request.ip,
    userAgent: request.userAgent,
    // The plaintext code is in scope for exactly this callback and nowhere else.
    hashCode: (challengeId) => hashOtpCode(code, challengeId),
  });

  try {
    await (request.delivery ?? deliveryAdapter()).send({
      to: request.destination,
      code,
      purpose: request.purpose,
      expiresInMinutes: Math.round(OTP_TTL_MS / 60_000),
    });
  } catch (error) {
    // The error is logged, not returned. A delivery provider's message can name the
    // recipient and its own internals, and neither belongs in a response to an
    // unauthenticated caller.
    console.error("[otp] delivery failed", error);
    await recordAudit({
      ...audit,
      action: "otp.issue",
      resourceType: "otp_challenge",
      resourceId: challenge.id,
      outcome: "FAILURE",
      metadata: { reason: "DELIVERY_FAILED", purpose: request.purpose },
      ip: request.ip,
      userAgent: request.userAgent,
    });
    return { ok: false, reason: "DELIVERY_FAILED" };
  }

  await recordAttempt({ action, accountSubject: subject, ip: request.ip, successful: true });
  await recordAudit({
    ...audit,
    action: "otp.issue",
    resourceType: "otp_challenge",
    resourceId: challenge.id,
    outcome: "SUCCESS",
    metadata: { purpose: request.purpose, expiresAt: expiresAt.toISOString() },
    ip: request.ip,
    userAgent: request.userAgent,
  });

  return { ok: true, expiresAt };
}

export interface VerifyOtpRequest {
  principal: OtpPrincipal;
  purpose: OtpPurposeValue;
  code: string;
  ip?: string | null;
  userAgent?: string | null;
}

export type VerifyOtpResult =
  | { ok: true; challengeId: string }
  | { ok: false; reason: "NO_CHALLENGE" | "INCORRECT" | "EXHAUSTED" }
  | { ok: false; reason: "RATE_LIMITED"; retryAfterSeconds: number };

/**
 * Verify a submitted code.
 *
 * Every failure path records a failed attempt before returning, including the "no live
 * challenge" case. Skipping the record there would leave the cheapest probe — submit
 * codes without ever requesting one — entirely uncounted.
 */
export async function verifyOtp(request: VerifyOtpRequest): Promise<VerifyOtpResult> {
  const action: AuthAction = "otp.verify";
  const now = new Date();
  const subject = subjectFor(request.principal);
  const audit = auditFieldsFor(request.principal);

  let counts;
  try {
    counts = await countRecentAttempts({
      action,
      accountSubject: subject,
      ip: request.ip,
      since: windowStart(action, now),
    });
  } catch (error) {
    console.error("[otp] rate-limit count failed; denying", error);
    return { ok: false, reason: "RATE_LIMITED", retryAfterSeconds: 60 };
  }

  const decision = evaluateRateLimit(action, counts);

  if (!decision.allowed) {
    await recordAttempt({ action, accountSubject: subject, ip: request.ip, successful: false });
    await recordAudit({
      ...audit,
      action: "otp.verify",
      resourceType: "otp_challenge",
      outcome: "DENIED",
      metadata: { reason: "RATE_LIMITED", limitedBy: decision.limitedBy },
      ip: request.ip,
      userAgent: request.userAgent,
    });
    return {
      ok: false,
      reason: "RATE_LIMITED",
      retryAfterSeconds: decision.retryAfterSeconds,
    };
  }

  const challenge = await findLiveChallenge(request.principal, request.purpose);

  if (!challenge) {
    await recordAttempt({ action, accountSubject: subject, ip: request.ip, successful: false });
    await recordAudit({
      ...audit,
      action: "otp.verify",
      resourceType: "otp_challenge",
      outcome: "FAILURE",
      metadata: { reason: "NO_CHALLENGE", purpose: request.purpose },
      ip: request.ip,
      userAgent: request.userAgent,
    });
    return { ok: false, reason: "NO_CHALLENGE" };
  }

  // Timing-safe, and salted with the challenge id — see hashOtpCode.
  if (!verifyOtpCode(request.code, challenge.id, challenge.codeHash)) {
    const attempt = await recordFailedAttempt(challenge.id);
    await recordAttempt({ action, accountSubject: subject, ip: request.ip, successful: false });
    await recordAudit({
      ...audit,
      action: "otp.verify",
      resourceType: "otp_challenge",
      resourceId: challenge.id,
      outcome: "FAILURE",
      metadata: {
        reason: attempt?.exhausted ? "EXHAUSTED" : "INCORRECT",
        attempts: attempt?.attempts ?? null,
      },
      ip: request.ip,
      userAgent: request.userAgent,
    });
    return { ok: false, reason: attempt?.exhausted ? "EXHAUSTED" : "INCORRECT" };
  }

  // Single use is enforced by the database: `markVerified` only matches a PENDING row, so
  // a concurrent second verification of the same code gets null here rather than a second
  // success.
  const consumed = await markVerified(challenge.id);

  if (!consumed) {
    await recordAttempt({ action, accountSubject: subject, ip: request.ip, successful: false });
    await recordAudit({
      ...audit,
      action: "otp.verify",
      resourceType: "otp_challenge",
      resourceId: challenge.id,
      outcome: "FAILURE",
      metadata: { reason: "ALREADY_CONSUMED" },
      ip: request.ip,
      userAgent: request.userAgent,
    });
    return { ok: false, reason: "NO_CHALLENGE" };
  }

  await recordAttempt({ action, accountSubject: subject, ip: request.ip, successful: true });

  // Clear the account's failure history so an earlier mistyped code does not count
  // against their next legitimate sign-in. The IP history is deliberately left alone.
  await clearAccountAttempts(subject, action);
  await clearAccountAttempts(subject, "otp.issue");

  await recordAudit({
    ...audit,
    action: "otp.verify",
    resourceType: "otp_challenge",
    resourceId: challenge.id,
    outcome: "SUCCESS",
    metadata: { purpose: request.purpose },
    ip: request.ip,
    userAgent: request.userAgent,
  });

  return { ok: true, challengeId: challenge.id };
}
