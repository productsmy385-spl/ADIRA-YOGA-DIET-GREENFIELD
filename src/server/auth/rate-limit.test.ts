import { describe, expect, it } from "vitest";

import {
  evaluateRateLimit,
  POLICIES,
  windowStart,
  type AuthAction,
  type RateLimitPolicy,
} from "./rate-limit";

const ACTIONS = Object.keys(POLICIES) as AuthAction[];

const policy: RateLimitPolicy = {
  windowSeconds: 900,
  maxPerAccount: 5,
  maxPerIp: 20,
};

describe("evaluateRateLimit", () => {
  it("allows an attempt when both budgets have room", () => {
    expect(evaluateRateLimit("otp.issue", { account: 0, ip: 0 }, policy)).toEqual({
      allowed: true,
      remaining: 5,
    });
  });

  it("reports the tighter of the two remaining budgets", () => {
    // 1 account attempt left, 3 IP attempts left → 1 is the real headroom.
    const decision = evaluateRateLimit("otp.issue", { account: 4, ip: 17 }, policy);
    expect(decision).toEqual({ allowed: true, remaining: 1 });
  });

  // The boundary that decides whether the limit is N or N+1. At exactly max prior
  // attempts the budget is spent, because the attempt being decided is not yet counted.
  it("denies at exactly the account limit, not one past it", () => {
    expect(evaluateRateLimit("otp.issue", { account: 4, ip: 0 }, policy).allowed).toBe(true);
    expect(evaluateRateLimit("otp.issue", { account: 5, ip: 0 })).toMatchObject({
      allowed: false,
    });
  });

  it("denies at exactly the IP limit", () => {
    expect(evaluateRateLimit("otp.issue", { account: 0, ip: 19 }, policy).allowed).toBe(true);
    expect(evaluateRateLimit("otp.issue", { account: 0, ip: 20 }, policy)).toMatchObject({
      allowed: false,
      limitedBy: "IP",
    });
  });

  it("reports the account as the cause when both budgets are spent", () => {
    // The more specific reason wins: telling a NAT-shared user their account is the
    // problem sends them down the wrong support path, but so does the reverse.
    expect(evaluateRateLimit("otp.issue", { account: 9, ip: 99 }, policy)).toMatchObject({
      allowed: false,
      limitedBy: "ACCOUNT",
    });
  });

  it("returns a retry hint equal to the window", () => {
    expect(evaluateRateLimit("otp.issue", { account: 5, ip: 0 }, policy)).toEqual({
      allowed: false,
      limitedBy: "ACCOUNT",
      retryAfterSeconds: 900,
    });
  });

  it("defaults to the configured policy when none is supplied", () => {
    const configured = POLICIES["otp.issue"];
    expect(
      evaluateRateLimit("otp.issue", { account: configured.maxPerAccount, ip: 0 }).allowed,
    ).toBe(false);
    expect(
      evaluateRateLimit("otp.issue", { account: configured.maxPerAccount - 1, ip: 0 })
        .allowed,
    ).toBe(true);
  });
});

describe("POLICIES", () => {
  it.each(ACTIONS)("gives %s a positive budget in both dimensions", (action) => {
    const p = POLICIES[action];
    expect(p.maxPerAccount).toBeGreaterThan(0);
    expect(p.maxPerIp).toBeGreaterThan(0);
    expect(p.windowSeconds).toBeGreaterThan(0);
  });

  // An IP budget tighter than the account budget would make the shared-address case
  // fail before the individual-account case, turning one abusive user behind a NAT into
  // an outage for everyone sharing it.
  it.each(ACTIONS)("gives %s a looser IP budget than account budget", (action) => {
    const p = POLICIES[action];
    expect(p.maxPerIp).toBeGreaterThan(p.maxPerAccount);
  });

  // Issuing sends an email; verifying does not. Issue must therefore be the tighter of
  // the two, or the endpoint becomes a way to bury someone's inbox.
  it("limits otp.issue more tightly than otp.verify", () => {
    expect(POLICIES["otp.issue"].maxPerAccount).toBeLessThan(
      POLICIES["otp.verify"].maxPerAccount,
    );
  });
});

describe("windowStart", () => {
  it("subtracts the policy window from the given instant", () => {
    const now = new Date("2026-08-22T12:00:00.000Z");
    expect(windowStart("otp.issue", now).toISOString()).toBe("2026-08-22T11:45:00.000Z");
  });

  it("takes the instant as an argument so windows are testable without faking timers", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const start = windowStart("passkey.authenticate", now);
    expect(now.getTime() - start.getTime()).toBe(
      POLICIES["passkey.authenticate"].windowSeconds * 1000,
    );
  });
});
