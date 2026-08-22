import { describe, expect, it } from "vitest";

import {
  addDays,
  dayOffset,
  formatDate,
  generateSchedule,
  generatesSchedule,
  parseDate,
  scheduleEndDate,
} from "./schedule";

const item = (weekNumber: number, dayOfWeek: number, sequence = 0, id = `w${weekNumber}d${dayOfWeek}s${sequence}`) => ({
  id,
  weekNumber,
  dayOfWeek,
  sequence,
});

describe("parseDate", () => {
  it("reads a calendar date as UTC midnight", () => {
    expect(parseDate("2026-08-22").toISOString()).toBe("2026-08-22T00:00:00.000Z");
  });

  it("rejects anything that is not YYYY-MM-DD", () => {
    for (const bad of ["22-08-2026", "2026/08/22", "2026-8-22", "", "today"]) {
      expect(() => parseDate(bad)).toThrow(/YYYY-MM-DD/);
    }
  });

  // `new Date("2026-02-30")` silently rolls forward to 2 March. Accepting it would
  // schedule a programme starting on a day that does not exist.
  it("rejects a date that does not exist", () => {
    expect(() => parseDate("2026-02-30")).toThrow(/not a real date/);
    expect(() => parseDate("2026-13-01")).toThrow();
    expect(() => parseDate("2025-02-29")).toThrow(/not a real date/);
  });

  it("accepts a real leap day", () => {
    expect(formatDate(parseDate("2028-02-29"))).toBe("2028-02-29");
  });
});

describe("addDays", () => {
  it("rolls over a month boundary", () => {
    expect(formatDate(addDays(parseDate("2026-01-31"), 1))).toBe("2026-02-01");
  });

  it("rolls over a year boundary", () => {
    expect(formatDate(addDays(parseDate("2026-12-31"), 1))).toBe("2027-01-01");
  });

  it("handles a leap year correctly", () => {
    expect(formatDate(addDays(parseDate("2028-02-28"), 1))).toBe("2028-02-29");
    expect(formatDate(addDays(parseDate("2027-02-28"), 1))).toBe("2027-03-01");
  });

  /**
   * The reason everything here is UTC. In a local-time implementation, adding 1 day
   * across a spring-forward boundary can land on the same calendar date, and across
   * autumn can skip one. A programme would then lose or repeat a day, twice a year, in
   * whichever timezone the server happens to run.
   */
  it("is unaffected by daylight-saving transitions", () => {
    // Northern spring forward, and autumn back.
    expect(formatDate(addDays(parseDate("2026-03-28"), 1))).toBe("2026-03-29");
    expect(formatDate(addDays(parseDate("2026-03-29"), 1))).toBe("2026-03-30");
    expect(formatDate(addDays(parseDate("2026-10-24"), 1))).toBe("2026-10-25");
    expect(formatDate(addDays(parseDate("2026-10-25"), 1))).toBe("2026-10-26");
  });

  it("adds 28 days across a full four-week programme", () => {
    expect(formatDate(addDays(parseDate("2026-08-22"), 27))).toBe("2026-09-18");
  });
});

describe("dayOffset", () => {
  it("puts week 1 day 1 on the start day itself", () => {
    expect(dayOffset(1, 1)).toBe(0);
  });

  it("advances seven days per week", () => {
    expect(dayOffset(2, 1)).toBe(7);
    expect(dayOffset(4, 1)).toBe(21);
  });

  it("advances one day per day within a week", () => {
    expect(dayOffset(1, 7)).toBe(6);
    expect(dayOffset(2, 3)).toBe(9);
  });
});

describe("generateSchedule", () => {
  /**
   * The decision this whole module rests on: day 1 is the START day, not Monday.
   *
   * If day 1 meant Monday, a customer beginning on a Wednesday would have week 1's
   * Monday and Tuesday fall in the past and be swept to MISSED overnight — two failures
   * on day one that they could not have avoided.
   */
  it("puts the first item on the start date, whatever weekday that is", () => {
    // 2026-08-26 is a Wednesday.
    const schedule = generateSchedule({
      startsOn: "2026-08-26",
      durationWeeks: 4,
      items: [item(1, 1)],
    });

    expect(schedule).toHaveLength(1);
    expect(schedule[0].scheduledFor).toBe("2026-08-26");
  });

  it("never schedules anything before the start date", () => {
    const schedule = generateSchedule({
      startsOn: "2026-08-26",
      durationWeeks: 2,
      items: [item(1, 1), item(1, 4), item(2, 7)],
    });

    for (const entry of schedule) {
      expect(entry.scheduledFor >= "2026-08-26").toBe(true);
    }
  });

  it("spaces weeks seven days apart", () => {
    const schedule = generateSchedule({
      startsOn: "2026-08-22",
      durationWeeks: 4,
      items: [item(1, 1), item(2, 1), item(3, 1), item(4, 1)],
    });

    expect(schedule.map((s) => s.scheduledFor)).toEqual([
      "2026-08-22",
      "2026-08-29",
      "2026-09-05",
      "2026-09-12",
    ]);
  });

  // Clamping would silently pile a five-week programme's extra work onto the last day of
  // a four-week assignment. Dropping is wrong in a way somebody notices.
  it("drops items positioned beyond the assignment's duration", () => {
    const schedule = generateSchedule({
      startsOn: "2026-08-22",
      durationWeeks: 2,
      items: [item(1, 1), item(2, 1), item(3, 1), item(9, 1)],
    });

    expect(schedule).toHaveLength(2);
    expect(schedule.map((s) => s.item.weekNumber)).toEqual([1, 2]);
  });

  it("drops items with an out-of-range day", () => {
    const schedule = generateSchedule({
      startsOn: "2026-08-22",
      durationWeeks: 4,
      items: [item(1, 0), item(1, 8), item(1, 3)],
    });

    expect(schedule).toHaveLength(1);
    expect(schedule[0].item.dayOfWeek).toBe(3);
  });

  it("orders by date, then by sequence within a day", () => {
    const schedule = generateSchedule({
      startsOn: "2026-08-22",
      durationWeeks: 2,
      items: [item(2, 1, 0), item(1, 1, 2), item(1, 1, 0), item(1, 1, 1)],
    });

    expect(schedule.map((s) => [s.scheduledFor, s.item.sequence])).toEqual([
      ["2026-08-22", 0],
      ["2026-08-22", 1],
      ["2026-08-22", 2],
      ["2026-08-29", 0],
    ]);
  });

  it("returns nothing for an assignment with no items", () => {
    expect(
      generateSchedule({ startsOn: "2026-08-22", durationWeeks: 4, items: [] }),
    ).toEqual([]);
  });

  it("refuses a duration of less than one week", () => {
    expect(() =>
      generateSchedule({ startsOn: "2026-08-22", durationWeeks: 0, items: [] }),
    ).toThrow(/at least one week/);
  });

  it("carries the original item through, so the caller can persist its id", () => {
    const source = item(1, 1, 0, "item-abc");
    const [entry] = generateSchedule({
      startsOn: "2026-08-22",
      durationWeeks: 1,
      items: [source],
    });

    expect(entry.item).toBe(source);
    expect(entry.item.id).toBe("item-abc");
  });

  it("generates a full four-week daily programme without gaps or repeats", () => {
    const items = [];
    for (let week = 1; week <= 4; week += 1) {
      for (let day = 1; day <= 7; day += 1) items.push(item(week, day));
    }

    const schedule = generateSchedule({
      startsOn: "2026-08-22",
      durationWeeks: 4,
      items,
    });

    expect(schedule).toHaveLength(28);
    expect(new Set(schedule.map((s) => s.scheduledFor)).size).toBe(28);
    expect(schedule[0].scheduledFor).toBe("2026-08-22");
    expect(schedule[27].scheduledFor).toBe("2026-09-18");
  });
});

describe("scheduleEndDate", () => {
  it("is inclusive of the final day", () => {
    // Four weeks starting Saturday 22 August ends Friday 18 September, not the 19th.
    expect(scheduleEndDate("2026-08-22", 4)).toBe("2026-09-18");
  });

  it("covers exactly seven days for a one-week assignment", () => {
    expect(scheduleEndDate("2026-08-22", 1)).toBe("2026-08-28");
  });
});

describe("generatesSchedule", () => {
  // docs/METRICS.md: a paused plan must not accumulate missed activities, or a customer
  // on agreed holiday returns to a wall of failure.
  it("generates work only for an ACTIVE assignment", () => {
    expect(generatesSchedule("ACTIVE")).toBe(true);
    for (const status of ["DRAFT", "PAUSED", "COMPLETED", "CANCELLED"]) {
      expect(generatesSchedule(status)).toBe(false);
    }
  });
});
