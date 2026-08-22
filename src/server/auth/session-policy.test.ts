import { describe, expect, it } from "vitest";

import {
  absoluteExpiryFor,
  cookieMaxAgeSeconds,
  isIdle,
  PLATFORM_SESSION_POLICY,
  policyFor,
  shouldTouch,
  TENANT_SESSION_POLICY,
} from "./session-policy";

const AT = (iso: string) => new Date(iso);
const BASE = AT("2026-08-22T09:00:00.000Z");

/** `base` shifted by `ms`, for readable "n minutes later" assertions. */
const after = (ms: number) => new Date(BASE.getTime() + ms);

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("policy shape", () => {
  it.each([
    ["tenant", TENANT_SESSION_POLICY],
    ["platform", PLATFORM_SESSION_POLICY],
  ])("%s: the idle window is shorter than the absolute lifetime", (_name, policy) => {
    // If idle >= absolute, the idle timeout can never fire — the session always dies of
    // old age first — and the policy silently means something other than it says.
    expect(policy.idleTimeoutMs).toBeLessThan(policy.absoluteLifetimeMs);
  });

  it.each([
    ["tenant", TENANT_SESSION_POLICY],
    ["platform", PLATFORM_SESSION_POLICY],
  ])("%s: the touch interval is far shorter than the idle window", (_name, policy) => {
    // Otherwise last_used_at is written so rarely that a live session looks idle.
    expect(policy.touchIntervalMs).toBeLessThan(policy.idleTimeoutMs / 10);
  });

  // The platform domain reaches every tenant, so its credential must live a shorter life
  // than a customer's. Reversing these would be an easy edit and a serious one.
  it("gives platform sessions a strictly shorter life than tenant sessions", () => {
    expect(PLATFORM_SESSION_POLICY.absoluteLifetimeMs).toBeLessThan(
      TENANT_SESSION_POLICY.absoluteLifetimeMs,
    );
    expect(PLATFORM_SESSION_POLICY.idleTimeoutMs).toBeLessThan(
      TENANT_SESSION_POLICY.idleTimeoutMs,
    );
  });
});

describe("policyFor", () => {
  it("maps each identity domain to its own policy", () => {
    expect(policyFor("PLATFORM")).toBe(PLATFORM_SESSION_POLICY);
    expect(policyFor("TENANT")).toBe(TENANT_SESSION_POLICY);
  });
});

describe("absoluteExpiryFor", () => {
  it("adds the absolute lifetime to the issue time", () => {
    expect(absoluteExpiryFor(TENANT_SESSION_POLICY, BASE)).toEqual(after(30 * DAY));
    expect(absoluteExpiryFor(PLATFORM_SESSION_POLICY, BASE)).toEqual(after(12 * HOUR));
  });

  it("does not mutate the date it is given", () => {
    const issuedAt = new Date(BASE);
    absoluteExpiryFor(TENANT_SESSION_POLICY, issuedAt);
    expect(issuedAt).toEqual(BASE);
  });

  // The schema carries CHECK (expires_at > issued_at); a zero or negative lifetime would
  // fail the insert at runtime rather than here.
  it("always produces an expiry strictly after the issue time", () => {
    for (const policy of [TENANT_SESSION_POLICY, PLATFORM_SESSION_POLICY]) {
      expect(absoluteExpiryFor(policy, BASE).getTime()).toBeGreaterThan(BASE.getTime());
    }
  });
});

describe("isIdle", () => {
  it("is false for activity just now", () => {
    expect(isIdle(TENANT_SESSION_POLICY, BASE, BASE)).toBe(false);
  });

  it("is false at exactly the idle boundary, and true one millisecond later", () => {
    const lastUsed = BASE;
    const boundary = after(TENANT_SESSION_POLICY.idleTimeoutMs);

    // Strictly greater-than: a session is idle once it has *exceeded* the window, so the
    // boundary itself is still live. Off-by-one here signs people out a tick early.
    expect(isIdle(TENANT_SESSION_POLICY, lastUsed, boundary)).toBe(false);
    expect(isIdle(TENANT_SESSION_POLICY, lastUsed, new Date(boundary.getTime() + 1))).toBe(
      true,
    );
  });

  it("applies the platform policy's much shorter window", () => {
    const threeHoursLater = after(3 * HOUR);

    // The same gap: idle for a platform owner (2h window), live for a tenant (7d).
    expect(isIdle(PLATFORM_SESSION_POLICY, BASE, threeHoursLater)).toBe(true);
    expect(isIdle(TENANT_SESSION_POLICY, BASE, threeHoursLater)).toBe(false);
  });

  // Clock skew between application instances can produce a last_used_at in the future.
  // That must read as "recently active", never as idle.
  it("treats a future last-used time as active rather than idle", () => {
    expect(isIdle(TENANT_SESSION_POLICY, after(MINUTE), BASE)).toBe(false);
  });
});

describe("shouldTouch", () => {
  it("does not write on two requests in quick succession", () => {
    expect(shouldTouch(TENANT_SESSION_POLICY, BASE, after(SECOND))).toBe(false);
  });

  it("writes once the touch interval has elapsed", () => {
    // Greater-than-or-equal at the boundary: the write is cheap and skipping it would
    // let a session that is refreshed exactly on the interval never update at all.
    expect(shouldTouch(TENANT_SESSION_POLICY, BASE, after(MINUTE))).toBe(true);
    expect(shouldTouch(TENANT_SESSION_POLICY, BASE, after(MINUTE + 1))).toBe(true);
  });

  it("does not write when last_used_at is in the future", () => {
    expect(shouldTouch(TENANT_SESSION_POLICY, after(MINUTE), BASE)).toBe(false);
  });
});

describe("cookieMaxAgeSeconds", () => {
  it("is the absolute lifetime in whole seconds", () => {
    expect(cookieMaxAgeSeconds(TENANT_SESSION_POLICY)).toBe((30 * DAY) / 1000);
    expect(cookieMaxAgeSeconds(PLATFORM_SESSION_POLICY)).toBe((12 * HOUR) / 1000);
  });

  /**
   * The cookie must outlive the idle window, not match it.
   *
   * The server decides whether a session is live; the cookie is only a hint. Setting
   * Max-Age to the idle window would have the browser discard a cookie whose session was
   * still perfectly valid — signing out a returning user for no reason, and presenting as
   * "it logs me out randomly", which is a miserable bug to chase.
   */
  it("outlives the idle window", () => {
    for (const policy of [TENANT_SESSION_POLICY, PLATFORM_SESSION_POLICY]) {
      expect(cookieMaxAgeSeconds(policy) * 1000).toBeGreaterThan(policy.idleTimeoutMs);
    }
  });

  it("is a whole number, as Set-Cookie requires", () => {
    for (const policy of [TENANT_SESSION_POLICY, PLATFORM_SESSION_POLICY]) {
      expect(Number.isInteger(cookieMaxAgeSeconds(policy))).toBe(true);
    }
  });
});
