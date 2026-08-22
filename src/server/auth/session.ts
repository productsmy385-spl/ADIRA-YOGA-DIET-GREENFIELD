import { cookies } from "next/headers";

import { env } from "@/lib/env";
import {
  createPlatformSession,
  createTenantSession,
  findPlatformSessionByTokenHash,
  findTenantSessionByTokenHash,
  revokePlatformSession,
  revokeTenantSession,
  touchPlatformSession,
  touchTenantSession,
  type PlatformSessionContext,
  type TenantSessionContext,
} from "@/server/repositories/sessions";

import {
  absoluteExpiryFor,
  cookieMaxAgeSeconds,
  isIdle,
  PLATFORM_SESSION_POLICY,
  shouldTouch,
  TENANT_SESSION_POLICY,
} from "./session-policy";
import { generateSessionToken, hashSessionToken } from "./tokens";

/**
 * Reading and writing the session cookie.
 *
 * This module is the only place that knows a cookie is how a session travels. The
 * repository below it knows only about token hashes; the services above it ask "who is
 * this request" and get an answer or null.
 *
 * THE PLAINTEXT TOKEN EXISTS FOR ONE STATEMENT
 *
 * `issue*Session` generates it, hashes it, writes the hash, sets the cookie, and drops
 * it. It is never returned to a caller, never logged, and never stored. If a future
 * change needs it after that point, the change is wrong.
 */

export const TENANT_COOKIE = "adira_session";
export const PLATFORM_COOKIE = "adira_owner_session";

/**
 * `Secure` is derived from APP_URL rather than from NODE_ENV.
 *
 * NODE_ENV is the usual choice and it is subtly wrong in both directions: a production
 * build served over plain HTTP behind a misconfigured proxy would get `Secure` and drop
 * the cookie silently (presenting as "login does nothing"), while a local HTTPS setup
 * would not get it. APP_URL is the actual origin, so it is the thing that actually knows.
 */
function cookiesAreSecure(): boolean {
  return env.APP_URL.startsWith("https://");
}

interface CookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
}

function cookieOptions(maxAgeSeconds: number): CookieOptions {
  return {
    // Not readable from JavaScript. This is what makes an XSS bug a serious problem
    // rather than an immediate total compromise of every signed-in account.
    httpOnly: true,
    secure: cookiesAreSecure(),
    // Lax, not Strict, deliberately: Adira sends reminder and report emails, and Strict
    // would drop the cookie when a customer follows one of those links, landing them on
    // a signed-out page. Lax withholds the cookie from cross-site POSTs, which is the
    // CSRF case that matters.
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export interface SessionRequestContext {
  ip?: string | null;
  userAgent?: string | null;
}

// ---------------------------------------------------------------------------
// Tenant domain
// ---------------------------------------------------------------------------

/**
 * Establish a tenant session and set its cookie.
 *
 * Callers must have verified a credential first. Nothing in this function authenticates
 * anybody — it is the step *after* authentication, and calling it on an unverified path
 * mints a valid session for whoever asked.
 */
export async function issueTenantSession(
  userId: string,
  organizationId: string,
  request: SessionRequestContext = {},
): Promise<void> {
  const token = generateSessionToken();
  const issuedAt = new Date();

  await createTenantSession(userId, organizationId, {
    tokenHash: hashSessionToken(token, env.SESSION_SECRET),
    expiresAt: absoluteExpiryFor(TENANT_SESSION_POLICY, issuedAt),
    ip: request.ip,
    userAgent: request.userAgent,
  });

  const store = await cookies();
  store.set(TENANT_COOKIE, token, cookieOptions(cookieMaxAgeSeconds(TENANT_SESSION_POLICY)));
}

/**
 * Resolve the current tenant session, or null.
 *
 * Returns null for every failure mode — no cookie, unknown token, revoked, expired,
 * suspended user, suspended organization, idle — and deliberately does not distinguish
 * between them to the caller. "Your session expired" and "you were suspended" are
 * different messages, but the place to decide that is a sign-in flow that can check
 * deliberately, not every page render.
 */
export async function readTenantSession(): Promise<TenantSessionContext | null> {
  const store = await cookies();
  const token = store.get(TENANT_COOKIE)?.value;
  if (!token) return null;

  const session = await findTenantSessionByTokenHash(
    hashSessionToken(token, env.SESSION_SECRET),
  );
  if (!session) return null;

  const now = new Date();

  // Absolute expiry is enforced in SQL; idle timeout is enforced here. A session that
  // has gone idle is revoked rather than merely rejected, so the row cannot be revived
  // by a request that arrives a moment later.
  if (isIdle(TENANT_SESSION_POLICY, session.lastUsedAt, now)) {
    await revokeTenantSession(session.sessionId);
    return null;
  }

  if (shouldTouch(TENANT_SESSION_POLICY, session.lastUsedAt, now)) {
    await touchTenantSession(session.sessionId);
  }

  return session;
}

/**
 * Sign out: revoke the row, then clear the cookie.
 *
 * That order matters. Clearing the cookie first and then failing to revoke would leave a
 * live session in the database that the user believes they have ended — and the token is
 * still valid for anyone who captured it.
 */
export async function endTenantSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(TENANT_COOKIE)?.value;

  if (token) {
    const session = await findTenantSessionByTokenHash(
      hashSessionToken(token, env.SESSION_SECRET),
    );
    if (session) await revokeTenantSession(session.sessionId);
  }

  store.delete(TENANT_COOKIE);
}

// ---------------------------------------------------------------------------
// Platform domain
// ---------------------------------------------------------------------------

export async function issuePlatformSession(
  ownerAccountId: string,
  request: SessionRequestContext = {},
): Promise<void> {
  const token = generateSessionToken();
  const issuedAt = new Date();

  await createPlatformSession(ownerAccountId, {
    // A DIFFERENT secret. This is the line that makes ADR-001's boundary cryptographic
    // rather than merely structural — see hashSessionToken.
    tokenHash: hashSessionToken(token, env.OWNER_SESSION_SECRET),
    expiresAt: absoluteExpiryFor(PLATFORM_SESSION_POLICY, issuedAt),
    ip: request.ip,
    userAgent: request.userAgent,
  });

  const store = await cookies();
  store.set(
    PLATFORM_COOKIE,
    token,
    cookieOptions(cookieMaxAgeSeconds(PLATFORM_SESSION_POLICY)),
  );
}

export async function readPlatformSession(): Promise<PlatformSessionContext | null> {
  const store = await cookies();
  const token = store.get(PLATFORM_COOKIE)?.value;
  if (!token) return null;

  const session = await findPlatformSessionByTokenHash(
    hashSessionToken(token, env.OWNER_SESSION_SECRET),
  );
  if (!session) return null;

  const now = new Date();

  if (isIdle(PLATFORM_SESSION_POLICY, session.lastUsedAt, now)) {
    await revokePlatformSession(session.sessionId);
    return null;
  }

  if (shouldTouch(PLATFORM_SESSION_POLICY, session.lastUsedAt, now)) {
    await touchPlatformSession(session.sessionId);
  }

  return session;
}

export async function endPlatformSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(PLATFORM_COOKIE)?.value;

  if (token) {
    const session = await findPlatformSessionByTokenHash(
      hashSessionToken(token, env.OWNER_SESSION_SECRET),
    );
    if (session) await revokePlatformSession(session.sessionId);
  }

  store.delete(PLATFORM_COOKIE);
}

export type { PlatformSessionContext, TenantSessionContext };
