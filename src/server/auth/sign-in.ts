import type { ClerkIdentity } from "./clerk";
import { issuePlatformSession, issueTenantSession } from "./session";

import { recordAudit } from "@/server/repositories/audit-logs";
import {
  findOwnerAccountByEmail,
  linkOwnerAccountToClerk,
  setOwnerAccountStatus,
} from "@/server/repositories/owner-accounts";
import {
  findAccountsForEmailAcrossTenants,
  linkUserToClerk,
  setUserStatus,
  touchLastSeen,
} from "@/server/repositories/users";

/**
 * Turning a verified Clerk identity into an Adira session (ADR-015).
 *
 * Clerk has already proved control of the address by the time anything here runs — that
 * proof is what the emailed OTP used to provide. What stays here is everything Clerk must
 * not decide:
 *
 *   INVITE-ONLY. A Clerk user with no INVITED or ACTIVE account gets NO_ACCOUNT and no
 *   database write. Clerk accounts are not Adira accounts.
 *
 *   LINK-ONCE. The first sign-in binds each account row to the Clerk user who proved its
 *   address (FlowDine OS, RASOIOS-ADR-006). A row bound to a different Clerk user is an
 *   identity conflict: excluded and audited, never silently re-bound.
 *
 *   ORDERING (ADR-012). Which organizations an address belongs to is disclosed only after
 *   verification — which is now always true here, since there is no pre-verification step.
 *
 *   TWO DOMAINS (ADR-001). The tenant and platform functions are separate, read separate
 *   tables and issue separate cookies. One Clerk user may hold both, but nothing here ever
 *   turns one into the other.
 */

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

type CandidateAccount = Awaited<ReturnType<typeof findAccountsForEmailAcrossTenants>>[number];

export interface AccountSelection<T> {
  /** May be entered now: ACTIVE or INVITED, and not bound to another Clerk user. */
  enterable: T[];
  /** Bound to a different Clerk user. Excluded, and worth an audit entry. */
  conflicts: T[];
}

/**
 * Pure: which of an address's accounts this Clerk user may enter.
 *
 * DISABLED, SUSPENDED, LOCKED and PENDING are simply not enterable. A conflict is checked
 * first so it is reported even on an account that would otherwise be blocked.
 */
export function selectEnterableAccounts<
  T extends { status: string; clerkUserId: string | null },
>(accounts: readonly T[], clerkUserId: string): AccountSelection<T> {
  const conflicts = accounts.filter((a) => a.clerkUserId !== null && a.clerkUserId !== clerkUserId);
  const enterable = accounts.filter(
    (a) =>
      !conflicts.includes(a) && (a.status === "ACTIVE" || a.status === "INVITED"),
  );
  return { enterable, conflicts };
}

export interface AvailableMembership {
  userId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
  status: string;
}

export type TenantSignInResult =
  | { kind: "SIGNED_IN"; role: CandidateAccount["role"] }
  | { kind: "CHOOSE_ORGANIZATION"; memberships: AvailableMembership[] }
  /** No enterable account. Covers "not invited" and "suspended" alike, by design. */
  | { kind: "NO_ACCOUNT" };

async function loadSelection(identity: ClerkIdentity, request: RequestMeta) {
  if (!identity.verifiedEmail) return null;

  const accounts = await findAccountsForEmailAcrossTenants(identity.verifiedEmail);
  const selection = selectEnterableAccounts(accounts, identity.clerkUserId);

  for (const conflict of selection.conflicts) {
    await recordAudit({
      organizationId: conflict.organizationId,
      actorDomain: "TENANT",
      actorId: null,
      actorLabel: identity.verifiedEmail,
      action: "auth.sign_in",
      resourceType: "user",
      resourceId: conflict.id,
      outcome: "DENIED",
      metadata: { reason: "IDENTITY_CONFLICT" },
      ip: request.ip,
      userAgent: request.userAgent,
    });
  }

  return selection;
}

/**
 * Sign the Clerk-verified person into Adira, or tell the caller what is needed next.
 */
export async function signInWithClerk(
  identity: ClerkIdentity,
  request: RequestMeta = {},
): Promise<TenantSignInResult> {
  const selection = await loadSelection(identity, request);

  if (!selection || selection.enterable.length === 0) {
    await recordAudit({
      organizationId: null,
      actorDomain: "TENANT",
      actorId: null,
      actorLabel: identity.verifiedEmail ?? `clerk:${identity.clerkUserId}`,
      action: "auth.sign_in",
      outcome: "DENIED",
      metadata: { reason: identity.verifiedEmail ? "NO_ACCOUNT" : "EMAIL_NOT_VERIFIED" },
      ip: request.ip,
      userAgent: request.userAgent,
    });
    return { kind: "NO_ACCOUNT" };
  }

  if (selection.enterable.length === 1) {
    const only = selection.enterable[0];
    const ok = await establishSession(only, identity, request);
    return ok ? { kind: "SIGNED_IN", role: only.role } : { kind: "NO_ACCOUNT" };
  }

  return {
    kind: "CHOOSE_ORGANIZATION",
    memberships: selection.enterable.map(toMembership),
  };
}

/**
 * The organizations this identity may choose between — for the chooser page.
 *
 * Re-derived from the live Clerk identity on every call; nothing about the list is carried
 * through the browser.
 */
export async function listEnterableMemberships(
  identity: ClerkIdentity,
): Promise<AvailableMembership[]> {
  const selection = await loadSelection(identity, {});
  return selection ? selection.enterable.map(toMembership) : [];
}

/**
 * Finish a sign-in where the person chose an organization.
 *
 * The posted organization id is only a CHOICE. It is honoured only if it is one of the
 * accounts the live, verified Clerk identity may enter — re-read from the database here —
 * so posting another tenant's id yields NOT_ALLOWED.
 */
export async function completeSignIn(
  identity: ClerkIdentity,
  organizationId: string,
  request: RequestMeta = {},
): Promise<{ ok: true; role: CandidateAccount["role"] } | { ok: false; reason: "NOT_ALLOWED" }> {
  const selection = await loadSelection(identity, request);
  const membership = selection?.enterable.find((a) => a.organizationId === organizationId);

  if (!membership) {
    await recordAudit({
      organizationId: null,
      actorDomain: "TENANT",
      actorId: null,
      actorLabel: identity.verifiedEmail ?? `clerk:${identity.clerkUserId}`,
      action: "auth.sign_in",
      outcome: "DENIED",
      metadata: { reason: "ORGANIZATION_NOT_A_MEMBERSHIP" },
      ip: request.ip,
      userAgent: request.userAgent,
    });
    return { ok: false, reason: "NOT_ALLOWED" };
  }

  const ok = await establishSession(membership, identity, request);
  return ok ? { ok: true, role: membership.role } : { ok: false, reason: "NOT_ALLOWED" };
}

function toMembership(account: CandidateAccount): AvailableMembership {
  return {
    userId: account.id,
    organizationId: account.organizationId,
    organizationName: account.organizationName,
    organizationSlug: account.organizationSlug,
    role: account.role,
    status: account.status,
  };
}

/**
 * Link, activate, issue. One copy, used by both paths above — a second, subtly different
 * "sign this person in" is where an authorization bug hides.
 */
async function establishSession(
  account: CandidateAccount,
  identity: ClerkIdentity,
  request: RequestMeta,
): Promise<boolean> {
  const email = identity.verifiedEmail ?? account.email;

  // Link-once. False means another Clerk user bound it between our read and this write.
  const linked = await linkUserToClerk(account.id, account.organizationId, identity.clerkUserId);
  if (!linked) return false;

  /*
   * INVITED → ACTIVE before issuing the session. Load-bearing: TENANT_SESSION_SELECT
   * filters on `u.status = 'ACTIVE'`, so a session issued to an INVITED user is written
   * and then never resolves — the person "signs in" and lands signed out, with nothing
   * logged. Proving the address through Clerk IS the activation.
   */
  if (account.status === "INVITED") {
    await setUserStatus(account.id, account.organizationId, "ACTIVE");
    await recordAudit({
      organizationId: account.organizationId,
      actorDomain: "TENANT",
      actorId: account.id,
      actorLabel: email,
      action: "account.activated",
      resourceType: "user",
      resourceId: account.id,
      outcome: "SUCCESS",
      metadata: { via: "clerk" },
      ip: request.ip,
      userAgent: request.userAgent,
    });
  }

  await issueTenantSession(account.id, account.organizationId, request);
  await touchLastSeen(account.id, account.organizationId);

  await recordAudit({
    organizationId: account.organizationId,
    actorDomain: "TENANT",
    actorId: account.id,
    actorLabel: email,
    action: "auth.sign_in",
    resourceType: "session",
    outcome: "SUCCESS",
    metadata: { method: "clerk" },
    ip: request.ip,
    userAgent: request.userAgent,
  });

  return true;
}

// ---------------------------------------------------------------------------
// Platform domain — separate functions, separate table, separate cookie (ADR-001)
// ---------------------------------------------------------------------------

export type OwnerSignInResult = { ok: true } | { ok: false };

/**
 * Platform-owner sign-in from a verified Clerk identity.
 *
 * Returns a bare failure for every refusal — not a platform account, disabled, suspended,
 * bound to another Clerk user. "This address is a platform owner" is the most valuable
 * fact on the system to confirm, so the page shows one message for all of them; the
 * reason goes only to the audit log.
 */
export async function ownerSignInWithClerk(
  identity: ClerkIdentity,
  request: RequestMeta = {},
): Promise<OwnerSignInResult> {
  const account = identity.verifiedEmail
    ? await findOwnerAccountByEmail(identity.verifiedEmail)
    : null;

  const reason = !identity.verifiedEmail
    ? "EMAIL_NOT_VERIFIED"
    : !account
      ? "NO_ACCOUNT"
      : account.clerkUserId !== null && account.clerkUserId !== identity.clerkUserId
        ? "IDENTITY_CONFLICT"
        : account.status !== "ACTIVE" && account.status !== "INVITED"
          ? "NOT_ALLOWED"
          : null;

  if (reason || !account || !(await linkOwnerAccountToClerk(account.id, identity.clerkUserId))) {
    await recordAudit({
      organizationId: null,
      actorDomain: "PLATFORM",
      actorId: account?.id ?? null,
      actorLabel: identity.verifiedEmail ?? `clerk:${identity.clerkUserId}`,
      action: "auth.sign_in",
      outcome: "DENIED",
      metadata: { reason: reason ?? "IDENTITY_CONFLICT" },
      ip: request.ip,
      userAgent: request.userAgent,
    });
    return { ok: false };
  }

  // Same promotion as the tenant path, for the same reason (PLATFORM_SESSION_SELECT
  // filters on ACTIVE). This closes the loop opened by scripts/seed-owner.mjs.
  if (account.status === "INVITED") {
    await setOwnerAccountStatus(account.id, "ACTIVE");
  }

  await issuePlatformSession(account.id, request);

  await recordAudit({
    organizationId: null,
    actorDomain: "PLATFORM",
    actorId: account.id,
    actorLabel: account.email,
    action: "auth.sign_in",
    resourceType: "owner_session",
    outcome: "SUCCESS",
    metadata: { method: "clerk" },
    ip: request.ip,
    userAgent: request.userAgent,
  });

  return { ok: true };
}
