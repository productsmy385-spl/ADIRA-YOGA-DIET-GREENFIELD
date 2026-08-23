import { evaluateRateLimit, windowStart, type AuthAction } from "./rate-limit";

import { recordAudit } from "@/server/repositories/audit-logs";
import { countRecentAttempts, recordAttempt } from "@/server/repositories/auth-attempts";
import { createAccessRequest } from "@/server/repositories/access-requests";
import { findOrganizationByJoinCode } from "@/server/repositories/organizations";

/**
 * The public access-request path.
 *
 * This is the only unauthenticated WRITE endpoint in the product, which makes it the
 * largest new attack surface in ADR-013. Three rules govern it, and all three are the
 * caller's responsibility to preserve:
 *
 *   1. NO ORGANIZATION IS EVER DISCLOSED. The join code resolves server-side. There is no
 *      endpoint that lists organizations, and an invalid code must be indistinguishable
 *      from a code belonging to a suspended one — otherwise the form becomes a probe for
 *      "which studios use Adira", which is precisely what `join_code` was designed to
 *      prevent (ADR-013 Q2).
 *
 *   2. NO ROLE MAY BE EXPRESSED. There is no field for it here, no column for it in the
 *      table, and the INSERT that eventually creates the account writes 'USER' as a
 *      literal. A privileged role is not merely rejected; it is unrepresentable.
 *
 *   3. THE LIMITER FAILS CLOSED. If the attempt count cannot be read, the submission is
 *      refused. A limiter that fails open under load has an off switch an attacker can
 *      reach by causing load.
 */

export interface SubmitAccessRequestInput {
  joinCode: string;
  fullName: string;
  email: string;
  phone?: string | null;
  reason?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export type SubmitAccessRequestResult =
  | { ok: true }
  | { ok: false; reason: "INVALID_INPUT"; fields: Record<string, string> }
  | { ok: false; reason: "RATE_LIMITED"; retryAfterSeconds: number };

function looksLikeEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

/**
 * Validate shape only.
 *
 * Field-level errors are safe to return because they describe what the submitter typed,
 * not what exists on the server. "This is not an email address" reveals nothing; "no such
 * organization" would.
 */
function validate(input: SubmitAccessRequestInput): Record<string, string> {
  const fields: Record<string, string> = {};

  if (!input.joinCode || input.joinCode.trim().length < 8) {
    fields.joinCode = "Enter the code your organisation gave you.";
  }
  if (!input.fullName || input.fullName.trim().length === 0) {
    fields.fullName = "Enter your full name.";
  }
  if (!input.email || !looksLikeEmail(input.email.trim())) {
    fields.email = "Enter a valid email address.";
  }
  if (input.reason && input.reason.length > 2000) {
    fields.reason = "Please keep this under 2000 characters.";
  }

  return fields;
}

/**
 * Submit a request, or convincingly appear to.
 *
 * A bad join code returns `ok: true`, exactly like a good one. That is deliberate and it
 * is the whole enumeration defence: any observable difference — status, body, or wording —
 * turns this endpoint into a way to test codes and discover tenants.
 *
 * The failure is recorded in `audit_logs` with the code's *presence* but never a hint of
 * which organizations exist, so an operator can see a burst of invalid codes and act on it
 * while a submitter learns nothing.
 */
export async function submitAccessRequest(
  input: SubmitAccessRequestInput,
): Promise<SubmitAccessRequestResult> {
  const action: AuthAction = "access_request.submit";
  const now = new Date();

  const fields = validate(input);
  if (Object.keys(fields).length > 0) {
    return { ok: false, reason: "INVALID_INPUT", fields };
  }

  const email = input.email.trim().toLowerCase();

  // The rate-limit subject is the submitted ADDRESS, because an applicant has no account
  // id yet. Counting by address is also what makes spraying one code at many addresses
  // visible.
  let counts;
  try {
    counts = await countRecentAttempts({
      action,
      accountSubject: email,
      ip: input.ip,
      since: windowStart(action, now),
    });
  } catch (error) {
    console.error("[access-request] rate-limit count failed; denying", error);
    return { ok: false, reason: "RATE_LIMITED", retryAfterSeconds: 60 };
  }

  const decision = evaluateRateLimit(action, counts);
  if (!decision.allowed) {
    await recordAttempt({ action, accountSubject: email, ip: input.ip, successful: false });
    return {
      ok: false,
      reason: "RATE_LIMITED",
      retryAfterSeconds: decision.retryAfterSeconds,
    };
  }

  const organization = await findOrganizationByJoinCode(input.joinCode.trim());

  if (!organization) {
    // Counted as a failed attempt: an unknown code IS the signal worth limiting, and not
    // counting it would leave code-guessing unbounded.
    await recordAttempt({ action, accountSubject: email, ip: input.ip, successful: false });

    await recordAudit({
      organizationId: null,
      actorDomain: "TENANT",
      actorId: null,
      actorLabel: email,
      action: "access_request.submit",
      outcome: "FAILURE",
      // No organization id, no code, no hint of what would have been valid.
      metadata: { reason: "UNKNOWN_JOIN_CODE" },
      ip: input.ip,
      userAgent: input.userAgent,
    });

    // The SAME result a successful submission returns.
    return { ok: true };
  }

  const created = await createAccessRequest({
    organizationId: organization.id,
    fullName: input.fullName,
    email,
    phone: input.phone,
    reason: input.reason,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  await recordAttempt({ action, accountSubject: email, ip: input.ip, successful: true });

  if (!created.ok) {
    // A duplicate pending request is not an error the submitter needs to distinguish —
    // they already have one open, and saying so would confirm the code was valid.
    await recordAudit({
      organizationId: organization.id,
      actorDomain: "TENANT",
      actorId: null,
      actorLabel: email,
      action: "access_request.submit",
      outcome: "FAILURE",
      metadata: { reason: "DUPLICATE_PENDING" },
      ip: input.ip,
      userAgent: input.userAgent,
    });
    return { ok: true };
  }

  await recordAudit({
    organizationId: organization.id,
    actorDomain: "TENANT",
    actorId: null,
    actorLabel: email,
    action: "access_request.submit",
    resourceType: "access_request",
    resourceId: created.request.id,
    outcome: "SUCCESS",
    metadata: { status: "PENDING" },
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return { ok: true };
}
