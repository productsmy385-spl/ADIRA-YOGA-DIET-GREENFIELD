import { describe, expect, it } from "vitest";

import {
  assessAttention,
  checkInConsistency,
  completionPercent,
  EMPTY_COUNTS,
  isEngaged,
  reportedCompletionRate,
  resolvedCount,
  tally,
  type AttentionInput,
} from "./metrics";

describe("tally", () => {
  it("counts each status into the right bucket", () => {
    expect(
      tally(["COMPLETED", "COMPLETED", "MISSED", "SKIPPED", "PENDING", "REVIEW_REQUIRED"]),
    ).toEqual({
      completed: 2,
      missed: 1,
      skipped: 1,
      pending: 1,
      reviewRequired: 1,
    });
  });

  // A started-but-unfinished activity is in progress, not a failure. The nightly sweep
  // turns a past PENDING into MISSED; only then does it count against anyone.
  it("counts STARTED as pending, not as a failure", () => {
    const counts = tally(["STARTED", "STARTED"]);
    expect(counts.pending).toBe(2);
    expect(counts.missed).toBe(0);
    expect(resolvedCount(counts)).toBe(0);
  });

  it("returns empty counts for no activities", () => {
    expect(tally([])).toEqual(EMPTY_COUNTS);
  });
});

describe("resolvedCount", () => {
  it("counts completed, missed, and skipped", () => {
    expect(resolvedCount({ ...EMPTY_COUNTS, completed: 2, missed: 1, skipped: 1 })).toBe(4);
  });

  it("excludes pending, so a customer does not look bad until bedtime", () => {
    expect(resolvedCount({ ...EMPTY_COUNTS, completed: 1, pending: 5 })).toBe(1);
  });

  it("excludes review-required, which is a workflow state and not an outcome", () => {
    expect(resolvedCount({ ...EMPTY_COUNTS, completed: 1, reviewRequired: 9 })).toBe(1);
  });
});

describe("reportedCompletionRate", () => {
  /**
   * THE RULE THIS MODULE EXISTS FOR.
   *
   * Rendering 0% for a customer who was never given anything to do is a lie that looks
   * like a fact — and it would put exactly the wrong people on a consultant's list.
   */
  it("is null, not zero, when nothing has resolved", () => {
    expect(reportedCompletionRate(EMPTY_COUNTS)).toBeNull();
    expect(reportedCompletionRate({ ...EMPTY_COUNTS, pending: 10 })).toBeNull();
    expect(reportedCompletionRate({ ...EMPTY_COUNTS, reviewRequired: 3 })).toBeNull();
  });

  it("is genuinely zero when everything resolved as a failure", () => {
    // Distinct from the null case above: this customer was given work and did none of
    // it, which is a real 0% and must be reported as one.
    expect(reportedCompletionRate({ ...EMPTY_COUNTS, missed: 4 })).toBe(0);
  });

  it("is 1 when everything was completed", () => {
    expect(reportedCompletionRate({ ...EMPTY_COUNTS, completed: 5 })).toBe(1);
  });

  it("counts skipped against the customer", () => {
    // Skipping is a choice not to practise. Excluding it would let a customer reach 100%
    // by skipping everything they did not fancy.
    expect(reportedCompletionRate({ ...EMPTY_COUNTS, completed: 3, skipped: 1 })).toBe(0.75);
  });

  it("ignores pending when computing the rate", () => {
    expect(
      reportedCompletionRate({ ...EMPTY_COUNTS, completed: 3, missed: 1, pending: 96 }),
    ).toBe(0.75);
  });
});

describe("completionPercent", () => {
  it("rounds, and preserves null", () => {
    expect(completionPercent({ ...EMPTY_COUNTS, completed: 2, missed: 1 })).toBe(67);
    expect(completionPercent(EMPTY_COUNTS)).toBeNull();
  });
});

describe("checkInConsistency", () => {
  it("is null when the plan was active for no days", () => {
    expect(checkInConsistency(0, 0)).toBeNull();
    expect(checkInConsistency(3, 0)).toBeNull();
  });

  it("is the proportion of active days with a check-in", () => {
    expect(checkInConsistency(5, 7)).toBeCloseTo(5 / 7);
  });

  // Defensive: a data anomaly must not produce 114% consistency on a dashboard.
  it("never exceeds 1", () => {
    expect(checkInConsistency(8, 7)).toBe(1);
  });
});

describe("isEngaged", () => {
  // Deliberately generous — a customer who checks in daily while struggling is engaged,
  // arguably more than one who silently completes everything.
  it("counts a check-in alone as engagement", () => {
    expect(isEngaged(0, 1)).toBe(true);
  });

  it("counts a completion alone as engagement", () => {
    expect(isEngaged(1, 0)).toBe(true);
  });

  it("is false only with neither", () => {
    expect(isEngaged(0, 0)).toBe(false);
  });
});

describe("assessAttention", () => {
  const base: AttentionInput = {
    hasFlaggedActivity: false,
    hasActivePlan: true,
    daysSinceAssigned: 10,
    everCompletedAnything: true,
    consecutiveSilentDays: 0,
    missedInWindow: 0,
    currentRate: 0.9,
    previousRate: 0.9,
    consecutiveLowWellbeing: 0,
  };

  it("does not flag a customer who is doing fine", () => {
    expect(assessAttention(base)).toEqual({ flagged: false, signals: [], primary: null });
  });

  it("flags a consultant-flagged activity above everything else", () => {
    const result = assessAttention({
      ...base,
      hasFlaggedActivity: true,
      missedInWindow: 5,
    });
    expect(result.primary).toBe("CONSULTANT_FLAGGED");
    expect(result.signals).toContain("REPEATED_MISSES");
  });

  // The worst failure is silent: someone who never begins trips no rate-based rule.
  it("flags a customer who never started", () => {
    expect(
      assessAttention({ ...base, daysSinceAssigned: 4, everCompletedAnything: false })
        .primary,
    ).toBe("NEVER_STARTED");
  });

  it("gives a new customer three days before flagging them", () => {
    expect(
      assessAttention({ ...base, daysSinceAssigned: 3, everCompletedAnything: false })
        .flagged,
    ).toBe(false);
  });

  it("flags four consecutive silent days but not three", () => {
    expect(assessAttention({ ...base, consecutiveSilentDays: 3 }).flagged).toBe(false);
    expect(assessAttention({ ...base, consecutiveSilentDays: 4 }).primary).toBe(
      "SUSTAINED_ABSENCE",
    );
  });

  /**
   * Compared against the customer's own baseline, not a cohort. This is the case an
   * absolute cutoff misses entirely — 70% would pass any "below 60%" rule while
   * representing a serious fall.
   */
  it("flags a fall against the customer's own previous window", () => {
    expect(
      assessAttention({ ...base, previousRate: 0.95, currentRate: 0.7 }).signals,
    ).toContain("ADHERENCE_COLLAPSE");
  });

  it("does not flag a consistently low but stable adherence", () => {
    // 55% may be exactly what was agreed for this person. Flagging them every week
    // would train the consultant to ignore the list.
    expect(
      assessAttention({ ...base, previousRate: 0.55, currentRate: 0.55 }).flagged,
    ).toBe(false);
  });

  it("does not flag a rise", () => {
    expect(
      assessAttention({ ...base, previousRate: 0.5, currentRate: 0.9 }).flagged,
    ).toBe(false);
  });

  it("cannot assess a collapse without both windows", () => {
    expect(
      assessAttention({ ...base, previousRate: null, currentRate: 0.2 }).signals,
    ).not.toContain("ADHERENCE_COLLAPSE");
  });

  it("flags three misses in the window but not two", () => {
    expect(assessAttention({ ...base, missedInWindow: 2 }).flagged).toBe(false);
    expect(assessAttention({ ...base, missedInWindow: 3 }).signals).toContain(
      "REPEATED_MISSES",
    );
  });

  it("flags three consecutive low wellbeing check-ins but not two", () => {
    expect(assessAttention({ ...base, consecutiveLowWellbeing: 2 }).flagged).toBe(false);
    expect(assessAttention({ ...base, consecutiveLowWellbeing: 3 }).signals).toContain(
      "WELLBEING_DECLINE",
    );
  });

  /**
   * docs/METRICS.md: a paused plan schedules nothing, so it can miss nothing. Flagging a
   * customer on agreed holiday tells a consultant to chase someone who did exactly what
   * was agreed.
   */
  it("suppresses every signal for a customer with no active plan", () => {
    const result = assessAttention({
      ...base,
      hasActivePlan: false,
      everCompletedAnything: false,
      daysSinceAssigned: 30,
      consecutiveSilentDays: 30,
      missedInWindow: 20,
      previousRate: 1,
      currentRate: 0,
      consecutiveLowWellbeing: 10,
    });

    expect(result).toEqual({ flagged: false, signals: [], primary: null });
  });

  // A consultant's own flag is deliberate and does not depend on plan status.
  it("still surfaces a consultant flag when the plan is paused", () => {
    expect(
      assessAttention({ ...base, hasActivePlan: false, hasFlaggedActivity: true }).primary,
    ).toBe("CONSULTANT_FLAGGED");
  });

  it("ranks multiple signals by severity", () => {
    const result = assessAttention({
      ...base,
      consecutiveSilentDays: 5,
      missedInWindow: 4,
      consecutiveLowWellbeing: 3,
    });

    expect(result.signals).toEqual([
      "SUSTAINED_ABSENCE",
      "REPEATED_MISSES",
      "WELLBEING_DECLINE",
    ]);
    expect(result.primary).toBe("SUSTAINED_ABSENCE");
  });
});
