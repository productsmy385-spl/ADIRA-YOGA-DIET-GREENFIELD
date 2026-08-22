/**
 * Session lifetimes and expiry arithmetic.
 *
 * Pure and side-effect free so the rules can be tested exhaustively without a database
 * or a clock. `sessions.ts` (the repository) applies them; this file only states them.
 *
 * docs/AUTHENTICATION.md left three questions open for Phase 2 — lifetime, idle timeout,
 * and whether sliding expiry applies to both domains. This module is the answer, and
 * decisions/ADR-011 records why.
 */

import type { IdentityDomainValue } from "@/server/db/types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface SessionPolicy {
  /**
   * Hard ceiling from issue. Reached regardless of activity, so a stolen cookie has a
   * bounded life even if the thief keeps it warm.
   */
  readonly absoluteLifetimeMs: number;

  /**
   * Inactivity after which the session dies even though `absoluteLifetimeMs` has not
   * elapsed. This is what makes an abandoned session on a shared device time out.
   */
  readonly idleTimeoutMs: number;

  /**
   * How stale `last_used_at` may get before a request writes it back.
   *
   * Without this, every authenticated request issues an UPDATE, which turns a read-only
   * page load into a write and makes `sessions` the hottest table in the system for no
   * benefit. One minute of imprecision on an idle timeout measured in hours costs
   * nothing.
   */
  readonly touchIntervalMs: number;
}

/**
 * Tenant sessions: customers and studio staff, mostly on phones.
 *
 * Thirty days absolute with a seven-day idle window. Shorter would mean a customer who
 * opens the app weekly is signed out every time — and the realistic response to that is
 * that they stop logging their practice, which defeats the product. The risk is bounded
 * by the idle timeout and by status being part of the authenticating query: suspending
 * an account kills its sessions on the next request, without a sweep.
 */
export const TENANT_SESSION_POLICY: SessionPolicy = {
  absoluteLifetimeMs: 30 * DAY,
  idleTimeoutMs: 7 * DAY,
  touchIntervalMs: MINUTE,
};

/**
 * Platform-owner sessions: far more privileged, far fewer of them, and used from a desk.
 *
 * Twelve hours absolute, two hours idle. A platform owner can reach every tenant, so the
 * convenience argument above does not apply — signing in again at the start of the day
 * is a reasonable price for a credential that spans the whole platform.
 */
export const PLATFORM_SESSION_POLICY: SessionPolicy = {
  absoluteLifetimeMs: 12 * HOUR,
  idleTimeoutMs: 2 * HOUR,
  touchIntervalMs: MINUTE,
};

export function policyFor(domain: IdentityDomainValue): SessionPolicy {
  return domain === "PLATFORM" ? PLATFORM_SESSION_POLICY : TENANT_SESSION_POLICY;
}

/** The `expires_at` to store for a session issued at `issuedAt`. */
export function absoluteExpiryFor(policy: SessionPolicy, issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + policy.absoluteLifetimeMs);
}

/**
 * Has this session gone idle?
 *
 * Kept separate from absolute expiry because the two are enforced in different places:
 * absolute expiry is a SQL predicate on `expires_at` (so the database can use the index
 * and an expired row never leaves PostgreSQL), while the idle check compares
 * `last_used_at` against the policy. Expressing idle timeout in SQL too would mean
 * embedding the interval in the query text, which puts the policy in two places.
 */
export function isIdle(policy: SessionPolicy, lastUsedAt: Date, now: Date): boolean {
  return now.getTime() - lastUsedAt.getTime() > policy.idleTimeoutMs;
}

/** Should this request write `last_used_at` back? See `touchIntervalMs`. */
export function shouldTouch(policy: SessionPolicy, lastUsedAt: Date, now: Date): boolean {
  return now.getTime() - lastUsedAt.getTime() >= policy.touchIntervalMs;
}

/**
 * Cookie `Max-Age`, in seconds.
 *
 * Deliberately the ABSOLUTE lifetime, not the idle window. The cookie is a client-side
 * hint and nothing more — the server decides whether a session is live. Setting it to
 * the idle window would silently sign out a returning user whose session was still
 * perfectly valid server-side.
 */
export function cookieMaxAgeSeconds(policy: SessionPolicy): number {
  return Math.floor(policy.absoluteLifetimeMs / 1000);
}
