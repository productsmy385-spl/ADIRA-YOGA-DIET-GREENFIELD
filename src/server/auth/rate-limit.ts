/**
 * Rate limiting policy for authentication actions.
 *
 * The *decision* is pure and lives here; the *counting* is a repository query against
 * `auth_attempts`. Splitting them means the policy — the part that is easy to get subtly
 * wrong and impossible to eyeball — is exhaustively testable without a database.
 *
 * TWO DIMENSIONS, ALWAYS BOTH
 *
 * Every action is limited per-account and per-IP, and both must pass. Each alone has a
 * hole the other covers:
 *
 *   account only → an attacker sprays one attempt at ten thousand accounts from one
 *                  host and is never limited
 *   IP only      → a distributed attacker gets unlimited attempts per account
 *
 * The per-IP budget is deliberately looser than per-account, because an IP is a poor
 * identifier: a corporate NAT, a university, or a mobile carrier can put thousands of
 * legitimate people behind one address. Too tight, and the limiter becomes an outage for
 * everyone sharing that address.
 *
 * FAIL CLOSED
 *
 * If the attempt count cannot be read, the caller must deny. A limiter that fails open
 * is not a limiter — it is a limiter with an off switch that an attacker can reach by
 * causing load.
 */

export type AuthAction = "otp.issue" | "otp.verify" | "passkey.authenticate";

export interface RateLimitPolicy {
  /** Window length in seconds. */
  readonly windowSeconds: number;
  /** Maximum attempts from one account within the window. */
  readonly maxPerAccount: number;
  /** Maximum attempts from one IP within the window. */
  readonly maxPerIp: number;
}

/**
 * Budgets are per fifteen minutes.
 *
 * `otp.issue` is the tightest: each issue sends an email, so an unlimited issue endpoint
 * is both an account-lockout vector (the recipient is buried) and a way to spend the
 * sender's reputation. Five is generous for a person who genuinely did not receive one.
 *
 * `otp.verify` is bounded here as well as by the per-challenge attempt budget. The
 * per-challenge counter stops guessing at one code; this stops an attacker requesting a
 * fresh challenge each time to reset that counter.
 */
export const POLICIES: Record<AuthAction, RateLimitPolicy> = {
  "otp.issue": { windowSeconds: 900, maxPerAccount: 5, maxPerIp: 20 },
  "otp.verify": { windowSeconds: 900, maxPerAccount: 10, maxPerIp: 60 },
  "passkey.authenticate": { windowSeconds: 900, maxPerAccount: 20, maxPerIp: 100 },
};

export interface AttemptCounts {
  readonly account: number;
  readonly ip: number;
}

export type RateLimitDecision =
  | { readonly allowed: true; readonly remaining: number }
  | {
      readonly allowed: false;
      readonly limitedBy: "ACCOUNT" | "IP";
      readonly retryAfterSeconds: number;
    };

/**
 * Decide whether one more attempt is permitted.
 *
 * `counts` are attempts already made inside the window. The comparison is `>=` because
 * the attempt being decided is not yet counted: at exactly `maxPerAccount` prior
 * attempts the budget is spent, and allowing one more would permit N+1.
 *
 * Account is checked before IP so the reported reason is the more specific one — telling
 * a NAT-shared user "your account is locked" when it is really the shared address would
 * send them down the wrong support path.
 */
export function evaluateRateLimit(
  action: AuthAction,
  counts: AttemptCounts,
  policy: RateLimitPolicy = POLICIES[action],
): RateLimitDecision {
  if (counts.account >= policy.maxPerAccount) {
    return {
      allowed: false,
      limitedBy: "ACCOUNT",
      retryAfterSeconds: policy.windowSeconds,
    };
  }

  if (counts.ip >= policy.maxPerIp) {
    return { allowed: false, limitedBy: "IP", retryAfterSeconds: policy.windowSeconds };
  }

  return {
    allowed: true,
    remaining: Math.min(
      policy.maxPerAccount - counts.account,
      policy.maxPerIp - counts.ip,
    ),
  };
}

/**
 * The instant from which attempts should be counted.
 *
 * Passed to the repository as the lower bound of the window. Taking `now` as an argument
 * rather than calling `Date.now()` internally is what makes window behaviour testable
 * without faking timers.
 */
export function windowStart(action: AuthAction, now: Date): Date {
  return new Date(now.getTime() - POLICIES[action].windowSeconds * 1000);
}
