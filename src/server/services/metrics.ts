import type { ActivityStatusValue } from "@/server/db/types";

/**
 * The derived figures, implemented exactly once.
 *
 * `docs/METRICS.md` defines every number here, including its denominator and what it
 * excludes. This module is the only implementation of those definitions — a metric
 * computed in two places will disagree in one of them, and a wrong metric is invisible
 * because it still looks like a number.
 *
 * Everything is pure. Counting rows is the repository's job; deciding what the counts
 * mean is this file's, and that separation is what makes these rules exhaustively
 * testable without a database.
 *
 * THE RULE THAT MATTERS MOST: undefined is not zero.
 *
 * A customer with no scheduled activities has NO adherence, not 0%. Rendering "0%" for
 * someone who was never given anything to do is a lie that looks like a fact, and it
 * would put exactly the wrong people on a consultant's attention list.
 */

export interface ActivityCounts {
  completed: number;
  missed: number;
  skipped: number;
  /** Excluded from the denominator — the day is not over. */
  pending: number;
  /** Excluded entirely: a consultant workflow state, not an outcome. */
  reviewRequired: number;
}

export const EMPTY_COUNTS: ActivityCounts = {
  completed: 0,
  missed: 0,
  skipped: 0,
  pending: 0,
  reviewRequired: 0,
};

/**
 * Tally a set of activity statuses into the shape the rates below expect.
 *
 * `PENDING` and `STARTED` are counted together: a started-but-unfinished activity is
 * still in progress, not a failure. The nightly sweep is what turns a past PENDING into
 * MISSED, and only then does it enter a denominator.
 */
export function tally(statuses: readonly ActivityStatusValue[]): ActivityCounts {
  const counts = { ...EMPTY_COUNTS };

  for (const status of statuses) {
    switch (status) {
      case "COMPLETED":
        counts.completed += 1;
        break;
      case "MISSED":
        counts.missed += 1;
        break;
      case "SKIPPED":
        counts.skipped += 1;
        break;
      case "PENDING":
      case "STARTED":
        counts.pending += 1;
        break;
      case "REVIEW_REQUIRED":
        counts.reviewRequired += 1;
        break;
    }
  }

  return counts;
}

/**
 * How many activities count toward a rate.
 *
 * Completed, missed, and skipped. Not pending — the day is not over, and counting it as
 * a failure makes every customer look bad until bedtime. Not review-required.
 */
export function resolvedCount(counts: ActivityCounts): number {
  return counts.completed + counts.missed + counts.skipped;
}

/**
 * Reported completion rate, 0–1, or **null when nothing has resolved**.
 *
 * Null, not zero. Every caller must handle it — which is the point: a component forced
 * to decide what "no data" looks like will render "—" rather than a confident 0%.
 *
 * Named "reported" because completion is self-declared and unverifiable by construction.
 * The product must never imply otherwise.
 */
export function reportedCompletionRate(counts: ActivityCounts): number | null {
  const denominator = resolvedCount(counts);
  if (denominator === 0) return null;
  return counts.completed / denominator;
}

/** Percentage, rounded, or null. Convenience for display only. */
export function completionPercent(counts: ActivityCounts): number | null {
  const rate = reportedCompletionRate(counts);
  return rate === null ? null : Math.round(rate * 100);
}

/**
 * Check-in consistency: days with a check-in over days the plan was active.
 *
 * Independent of whether activities were completed. Checking in to say "I did not
 * practise today" is engagement, not failure, and must never be penalised.
 */
export function checkInConsistency(
  daysWithCheckIn: number,
  daysActive: number,
): number | null {
  if (daysActive <= 0) return null;
  return Math.min(daysWithCheckIn, daysActive) / daysActive;
}

/**
 * Engaged in a window: at least one completion OR at least one check-in.
 *
 * Deliberately generous. This measures contact with the product, and a customer who
 * checks in daily while struggling is engaged — arguably more so than one who silently
 * completes everything.
 */
export function isEngaged(completions: number, checkIns: number): boolean {
  return completions > 0 || checkIns > 0;
}

// ---------------------------------------------------------------------------
// "Needs attention" — the consultant triage signal
// ---------------------------------------------------------------------------

export type AttentionSignal =
  | "CONSULTANT_FLAGGED"
  | "NEVER_STARTED"
  | "SUSTAINED_ABSENCE"
  | "ADHERENCE_COLLAPSE"
  | "REPEATED_MISSES"
  | "WELLBEING_DECLINE";

/** Highest first. The list a consultant sees is ranked by a customer's worst signal. */
const SEVERITY: readonly AttentionSignal[] = [
  "CONSULTANT_FLAGGED",
  "NEVER_STARTED",
  "SUSTAINED_ABSENCE",
  "ADHERENCE_COLLAPSE",
  "REPEATED_MISSES",
  "WELLBEING_DECLINE",
];

export interface AttentionInput {
  /** Any REVIEW_REQUIRED activity. */
  hasFlaggedActivity: boolean;
  /** Whether the customer has an ACTIVE (not paused) assignment. */
  hasActivePlan: boolean;
  daysSinceAssigned: number;
  everCompletedAnything: boolean;
  /** Consecutive days with neither a completion nor a check-in. */
  consecutiveSilentDays: number;
  missedInWindow: number;
  /** This window's rate, and the previous window's, each 0–1 or null. */
  currentRate: number | null;
  previousRate: number | null;
  /** Consecutive check-ins reporting the lowest band of mood or sleep. */
  consecutiveLowWellbeing: number;
}

export interface AttentionResult {
  flagged: boolean;
  signals: AttentionSignal[];
  /** The highest-severity signal, or null. */
  primary: AttentionSignal | null;
}

/**
 * Decide whether a customer needs a consultant's attention, and why.
 *
 * **[proposed]** — `docs/METRICS.md` records this as awaiting the user's confirmation.
 * It decides what a consultant looks at first, which is a care judgement rather than an
 * engineering one.
 *
 * Nothing fires without an active plan, except a consultant's own flag. A paused plan
 * schedules nothing, so it can miss nothing; and flagging a customer with no plan tells
 * a consultant to chase someone who was never given anything to do.
 */
export function assessAttention(input: AttentionInput): AttentionResult {
  const signals: AttentionSignal[] = [];

  // A consultant's own flag outranks everything and does not require an active plan —
  // they flagged it deliberately, and the plan's status is not their problem.
  if (input.hasFlaggedActivity) signals.push("CONSULTANT_FLAGGED");

  if (input.hasActivePlan) {
    // The worst failure is the silent one: a customer who never begins generates no
    // missed-activity pattern interesting enough to trip a rate-based rule.
    if (input.daysSinceAssigned > 3 && !input.everCompletedAnything) {
      signals.push("NEVER_STARTED");
    }

    if (input.consecutiveSilentDays >= 4) signals.push("SUSTAINED_ABSENCE");

    // Compared against the customer's OWN previous window, not a cohort. An absolute
    // cutoff permanently flags people whose lower capacity is exactly what was agreed,
    // while missing the one who fell from 95% to 70% — who is actually in trouble.
    if (
      input.currentRate !== null &&
      input.previousRate !== null &&
      input.previousRate - input.currentRate >= 0.25
    ) {
      signals.push("ADHERENCE_COLLAPSE");
    }

    if (input.missedInWindow >= 3) signals.push("REPEATED_MISSES");

    // Conservative on purpose: lowest band only, three in a row. Mood data is
    // self-reported and noisy, and a signal that fires often is one consultants learn to
    // ignore — which is worse than not having it.
    if (input.consecutiveLowWellbeing >= 3) signals.push("WELLBEING_DECLINE");
  }

  const ranked = SEVERITY.filter((signal) => signals.includes(signal));

  return {
    flagged: ranked.length > 0,
    signals: ranked,
    primary: ranked[0] ?? null,
  };
}
