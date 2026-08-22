import { issueOtp, verifyOtp } from "./otp";
import { issuePlatformSession, issueTenantSession } from "./session";
import { generateOtpCode, hashOtpCode } from "./tokens";

import { recordAudit } from "@/server/repositories/audit-logs";
import {
  findOwnerAccountByEmail,
  setOwnerAccountStatus,
} from "@/server/repositories/owner-accounts";
import {
  findAccountsForEmailAcrossTenants,
  normaliseEmail,
  setUserStatus,
  touchLastSeen,
} from "@/server/repositories/users";
import type { OtpPrincipal } from "@/server/repositories/otp-challenges";

/**
 * The sign-in flow.
 *
 * This module owns the two rules that the layers below it cannot enforce, because both
 * are properties of the *response* rather than of any single operation:
 *
 *   1. ENUMERATION. An unknown address and a known one produce the identical result.
 *      Nothing a caller can observe — status, body, or error — distinguishes them.
 *
 *   2. ORDERING (ADR-012). Which organizations an address belongs to is revealed only
 *      after a code has been verified. Before that, the answer is always the same.
 *
 * WHY OTP IS THE WAY IN AT ALL
 *
 * docs/AUTHENTICATION.md is explicit that OTP is not a general-purpose login path and
 * that passkeys are primary. Passkeys are not built yet, so today OTP is the only way to
 * establish a first session — it is the documented "recovery when no passkey is
 * available" case, which is every account until enrolment exists. When passkey
 * authentication lands, this path stays, but stops being the default.
 */

/**
 * The result of asking for a code.
 *
 * Deliberately carries no information about the address. There is no `accountExists`
 * field and no variant meaning "unknown address", because a field that exists is a field
 * that eventually gets rendered.
 */
export type RequestCodeResult =
  | { ok: true }
  | { ok: false; reason: "RATE_LIMITED"; retryAfterSeconds: number }
  | { ok: false; reason: "INVALID_EMAIL" };

export interface RequestCodeInput {
  email: string;
  ip?: string | null;
  userAgent?: string | null;
}

/** Cheap shape check. Rejecting obvious junk before touching the database is not a leak. */
function looksLikeEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

/**
 * Pick the account a challenge is issued against when an address has several.
 *
 * Deterministic — oldest first — because `verifySignInCode` must re-derive the *same*
 * principal to find the challenge it created. Anything order-dependent on the database's
 * whim (no ORDER BY, or ordering by a mutable column) would make verification fail
 * intermittently for exactly the multi-tenant users this path exists to serve.
 *
 * The choice is not meaningful to the person signing in. The code proves control of the
 * address; which row carries the challenge is bookkeeping, and the organization is chosen
 * afterwards.
 */
function primaryAccount<T extends { createdAt: Date; id: string }>(accounts: T[]): T {
  return [...accounts].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  )[0];
}

/**
 * Send a sign-in code, or convincingly appear to.
 *
 * The unknown-address branch still generates and hashes a code, so the two paths do
 * comparable CPU work rather than one returning conspicuously early.
 *
 * KNOWN LIMITATION, stated rather than hidden: the known-address branch also sends an
 * email, and that is slower than not sending one. A determined attacker with a stopwatch
 * can still distinguish the two. Closing that properly means moving delivery onto the job
 * queue (ADR-003) so both branches return before any mail is attempted — which is the
 * right fix and belongs with Phase 11, when the queue is drained. ADR-012 records this as
 * part of the contract.
 */
export async function requestSignInCode(
  input: RequestCodeInput,
): Promise<RequestCodeResult> {
  const email = normaliseEmail(input.email);

  if (!looksLikeEmail(email)) return { ok: false, reason: "INVALID_EMAIL" };

  const accounts = await findAccountsForEmailAcrossTenants(email);

  // Accounts that can never sign in are treated as absent. DISABLED is permanent, so
  // issuing a code would send mail to someone who cannot use it — and telling them
  // anything else would confirm the account exists.
  const usable = accounts.filter((account) => account.status !== "DISABLED");

  if (usable.length === 0) {
    // Do the work anyway, and throw the result away. This is not security theatre: it
    // keeps the two branches within the same order of magnitude of cost, and it means a
    // future edit that makes the real branch slower does not silently open a gap.
    const decoy = generateOtpCode();
    hashOtpCode(decoy, "00000000-0000-0000-0000-000000000000");

    await recordAudit({
      organizationId: null,
      actorDomain: "TENANT",
      actorId: null,
      // The address is recorded because a support conversation needs it, and because a
      // burst of these is the enumeration signal worth alerting on. It is not a secret —
      // the person submitting it already knows it.
      actorLabel: email,
      action: "auth.request_code",
      outcome: "FAILURE",
      metadata: { reason: "NO_ACCOUNT" },
      ip: input.ip,
      userAgent: input.userAgent,
    });

    // The SAME result the success path returns.
    return { ok: true };
  }

  const account = primaryAccount(usable);

  const principal: OtpPrincipal = {
    kind: "TENANT",
    userId: account.id,
    organizationId: account.organizationId,
  };

  const result = await issueOtp({
    principal,
    // An account that has never signed in is being activated; anything else is recovery.
    // The distinction is what the email says, and saying "activate your account" to a
    // returning customer is a small but real confusion.
    purpose: account.status === "INVITED" ? "ACCOUNT_ACTIVATION" : "ACCOUNT_RECOVERY",
    destination: email,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  if (!result.ok) {
    if (result.reason === "RATE_LIMITED") {
      return {
        ok: false,
        reason: "RATE_LIMITED",
        retryAfterSeconds: result.retryAfterSeconds,
      };
    }

    // Delivery failed. The caller is told the same thing as on success, because
    // "delivery failed for this address" is still a statement about the address. The
    // failure is in the audit log and the server log, where someone can act on it.
    return { ok: true };
  }

  return { ok: true };
}

/**
 * One organization the verified address may enter.
 *
 * Returned only after verification. Carries the minimum needed to choose: a name to
 * recognise and an id to act on.
 */
export interface AvailableMembership {
  userId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
  status: string;
}

export type VerifyCodeResult =
  | { ok: true; kind: "SIGNED_IN"; organizationId: string }
  | { ok: true; kind: "CHOOSE_ORGANIZATION"; memberships: AvailableMembership[] }
  | { ok: false; reason: "INCORRECT" | "EXPIRED" | "EXHAUSTED" | "NOT_ALLOWED" }
  | { ok: false; reason: "RATE_LIMITED"; retryAfterSeconds: number };

export interface VerifyCodeInput {
  email: string;
  code: string;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Verify a submitted code and, when there is only one, sign the person in.
 *
 * When the address belongs to several organizations the caller is handed the list and no
 * session is issued yet — `completeSignIn` finishes the job. This is the ADR-012 split:
 * the list is disclosed only on the far side of a verified credential.
 */
export async function verifySignInCode(
  input: VerifyCodeInput,
): Promise<VerifyCodeResult> {
  const email = normaliseEmail(input.email);

  const accounts = await findAccountsForEmailAcrossTenants(email);
  const usable = accounts.filter((account) => account.status !== "DISABLED");

  if (usable.length === 0) {
    // No account, so no challenge can exist. Answer as though the code were simply wrong
    // — which, from the submitter's point of view, is indistinguishable and true.
    return { ok: false, reason: "INCORRECT" };
  }

  const account = primaryAccount(usable);

  const result = await verifyOtp({
    principal: {
      kind: "TENANT",
      userId: account.id,
      organizationId: account.organizationId,
    },
    purpose: account.status === "INVITED" ? "ACCOUNT_ACTIVATION" : "ACCOUNT_RECOVERY",
    code: input.code,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "RATE_LIMITED":
        return {
          ok: false,
          reason: "RATE_LIMITED",
          retryAfterSeconds: result.retryAfterSeconds,
        };
      case "EXHAUSTED":
        return { ok: false, reason: "EXHAUSTED" };
      case "NO_CHALLENGE":
        // No live challenge: never requested, already used, or timed out. "Expired" is
        // the accurate and least confusing word for all three.
        return { ok: false, reason: "EXPIRED" };
      default:
        return { ok: false, reason: "INCORRECT" };
    }
  }

  // The credential has verified. From here, account state may be reported.
  const enterable = usable.filter(
    (candidate) => candidate.status === "ACTIVE" || candidate.status === "INVITED",
  );

  if (enterable.length === 0) {
    // SUSPENDED, LOCKED, or PENDING. Now safe to say so, because the caller has proved
    // control of the address.
    return { ok: false, reason: "NOT_ALLOWED" };
  }

  if (enterable.length === 1) {
    const only = enterable[0];
    await establishSession(only.id, only.organizationId, email, input, only.status);
    return { ok: true, kind: "SIGNED_IN", organizationId: only.organizationId };
  }

  return {
    ok: true,
    kind: "CHOOSE_ORGANIZATION",
    memberships: enterable.map((membership) => ({
      userId: membership.id,
      organizationId: membership.organizationId,
      organizationName: membership.organizationName,
      organizationSlug: membership.organizationSlug,
      role: membership.role,
      status: membership.status,
    })),
  };
}

/**
 * Issue the session and record it.
 *
 * Extracted because both the single-membership path above and `completeSignIn` below
 * must do exactly the same thing — and a second, subtly different copy of "sign this
 * person in" is precisely where an authorization bug hides.
 */
async function establishSession(
  userId: string,
  organizationId: string,
  email: string,
  request: { ip?: string | null; userAgent?: string | null },
  currentStatus?: string,
): Promise<void> {
  /*
   * Promote INVITED to ACTIVE before issuing the session.
   *
   * This is load-bearing, not tidiness. `TENANT_SESSION_SELECT` filters on
   * `u.status = 'ACTIVE'` — that is what makes suspension take effect by construction —
   * so a session issued to an INVITED user is written successfully and then never
   * resolves. The person sees the sign-in succeed, lands on a page that believes they
   * are signed out, and no error is logged anywhere, because nothing failed.
   *
   * Verifying an activation code IS the activation. There is no separate step, and the
   * status must move here, before the cookie is set.
   */
  if (currentStatus === "INVITED") {
    await setUserStatus(userId, organizationId, "ACTIVE");

    await recordAudit({
      organizationId,
      actorDomain: "TENANT",
      actorId: userId,
      actorLabel: email,
      action: "account.activated",
      resourceType: "user",
      resourceId: userId,
      outcome: "SUCCESS",
      metadata: { via: "otp" },
      ip: request.ip,
      userAgent: request.userAgent,
    });
  }

  await issueTenantSession(userId, organizationId, {
    ip: request.ip,
    userAgent: request.userAgent,
  });

  await touchLastSeen(userId, organizationId);

  await recordAudit({
    organizationId,
    actorDomain: "TENANT",
    actorId: userId,
    actorLabel: email,
    action: "auth.sign_in",
    resourceType: "session",
    outcome: "SUCCESS",
    metadata: { method: "otp" },
    ip: request.ip,
    userAgent: request.userAgent,
  });
}

export interface CompleteSignInInput {
  email: string;
  organizationId: string;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Finish a sign-in where the person had to choose an organization.
 *
 * THE DANGEROUS FUNCTION IN THIS FILE. It issues a session, and the only thing standing
 * between it and "mint a session for any organization id" is that the caller must have
 * verified a code moments earlier.
 *
 * That is enforced here rather than trusted: the chosen organization must be one this
 * address actually belongs to, re-read from the database rather than taken from the
 * request. A client that posts a different organization id — the obvious attack against a
 * two-step sign-in — gets NOT_ALLOWED, because its id is not in the list this query
 * returns.
 *
 * What it does NOT re-check is that a code was verified. A caller that reaches this
 * function without going through `verifySignInCode` is a bug in the route, not something
 * this function can detect; the route handler is where the two steps are tied together.
 */
export async function completeSignIn(
  input: CompleteSignInInput,
): Promise<{ ok: true } | { ok: false; reason: "NOT_ALLOWED" }> {
  const email = normaliseEmail(input.email);

  const accounts = await findAccountsForEmailAcrossTenants(email);

  const membership = accounts.find(
    (candidate) =>
      candidate.organizationId === input.organizationId &&
      (candidate.status === "ACTIVE" || candidate.status === "INVITED"),
  );

  if (!membership) {
    await recordAudit({
      organizationId: null,
      actorDomain: "TENANT",
      actorId: null,
      actorLabel: email,
      action: "auth.sign_in",
      outcome: "DENIED",
      metadata: { reason: "ORGANIZATION_NOT_A_MEMBERSHIP" },
      ip: input.ip,
      userAgent: input.userAgent,
    });
    return { ok: false, reason: "NOT_ALLOWED" };
  }

  await establishSession(
    membership.id,
    membership.organizationId,
    email,
    input,
    membership.status,
  );
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Platform domain
// ---------------------------------------------------------------------------

/**
 * Platform-owner sign-in.
 *
 * A separate pair of functions rather than a `domain` parameter on the ones above. The
 * tables, the cookie, the signing secret, and the consequences of a mistake are all
 * different, and ADR-001 exists to keep them that way — a shared implementation with a
 * branch is exactly the shape that lets a tenant slip into the platform domain.
 *
 * There is no organization choice here: platform accounts have no organization, by
 * construction.
 */
export async function requestOwnerSignInCode(
  input: RequestCodeInput,
): Promise<RequestCodeResult> {
  const email = normaliseEmail(input.email);

  if (!looksLikeEmail(email)) return { ok: false, reason: "INVALID_EMAIL" };

  const account = await findOwnerAccountByEmail(email);

  if (!account || account.status === "DISABLED") {
    const decoy = generateOtpCode();
    hashOtpCode(decoy, "00000000-0000-0000-0000-000000000000");

    await recordAudit({
      organizationId: null,
      actorDomain: "PLATFORM",
      actorId: null,
      actorLabel: email,
      action: "auth.request_code",
      outcome: "FAILURE",
      metadata: { reason: "NO_ACCOUNT" },
      ip: input.ip,
      userAgent: input.userAgent,
    });

    return { ok: true };
  }

  const result = await issueOtp({
    principal: { kind: "PLATFORM", ownerAccountId: account.id },
    purpose: account.status === "INVITED" ? "ACCOUNT_ACTIVATION" : "ACCOUNT_RECOVERY",
    destination: email,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  if (!result.ok && result.reason === "RATE_LIMITED") {
    return {
      ok: false,
      reason: "RATE_LIMITED",
      retryAfterSeconds: result.retryAfterSeconds,
    };
  }

  return { ok: true };
}

export type VerifyOwnerCodeResult =
  | { ok: true }
  | { ok: false; reason: "INCORRECT" | "EXPIRED" | "EXHAUSTED" | "NOT_ALLOWED" }
  | { ok: false; reason: "RATE_LIMITED"; retryAfterSeconds: number };

export async function verifyOwnerSignInCode(
  input: VerifyCodeInput,
): Promise<VerifyOwnerCodeResult> {
  const email = normaliseEmail(input.email);
  const account = await findOwnerAccountByEmail(email);

  if (!account || account.status === "DISABLED") {
    return { ok: false, reason: "INCORRECT" };
  }

  const result = await verifyOtp({
    principal: { kind: "PLATFORM", ownerAccountId: account.id },
    purpose: account.status === "INVITED" ? "ACCOUNT_ACTIVATION" : "ACCOUNT_RECOVERY",
    code: input.code,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "RATE_LIMITED":
        return {
          ok: false,
          reason: "RATE_LIMITED",
          retryAfterSeconds: result.retryAfterSeconds,
        };
      case "EXHAUSTED":
        return { ok: false, reason: "EXHAUSTED" };
      case "NO_CHALLENGE":
        return { ok: false, reason: "EXPIRED" };
      default:
        return { ok: false, reason: "INCORRECT" };
    }
  }

  if (account.status !== "ACTIVE" && account.status !== "INVITED") {
    return { ok: false, reason: "NOT_ALLOWED" };
  }

  // Same promotion as the tenant path, for the same reason: PLATFORM_SESSION_SELECT
  // filters on `a.status = 'ACTIVE'`, so a session issued to an INVITED owner account
  // would be written and then never resolve. This is also the step that closes the loop
  // opened by scripts/seed-owner.mjs, which deliberately creates the first platform
  // account as INVITED with no credential.
  if (account.status === "INVITED") {
    await setOwnerAccountStatus(account.id, "ACTIVE");
  }

  await issuePlatformSession(account.id, { ip: input.ip, userAgent: input.userAgent });

  await recordAudit({
    organizationId: null,
    actorDomain: "PLATFORM",
    actorId: account.id,
    actorLabel: email,
    action: "auth.sign_in",
    resourceType: "owner_session",
    outcome: "SUCCESS",
    metadata: { method: "otp" },
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return { ok: true };
}
