import { describe, expect, it } from "vitest";

import { formatInZone, zonedToUtc } from "./zoned-time";

describe("zonedToUtc", () => {
  it("converts India Standard Time (UTC+05:30)", () => {
    expect(zonedToUtc("2026-11-12", "18:00", "Asia/Kolkata")?.toISOString()).toBe("2026-11-12T12:30:00.000Z");
  });

  it("handles a date that crosses midnight in UTC", () => {
    expect(zonedToUtc("2026-11-12", "03:00", "Asia/Kolkata")?.toISOString()).toBe("2026-11-11T21:30:00.000Z");
  });

  it("respects daylight saving (London summer is UTC+1)", () => {
    expect(zonedToUtc("2026-07-01", "09:00", "Europe/London")?.toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(zonedToUtc("2026-12-01", "09:00", "Europe/London")?.toISOString()).toBe("2026-12-01T09:00:00.000Z");
  });

  it("rejects malformed input", () => {
    expect(zonedToUtc("12/11/2026", "18:00", "Asia/Kolkata")).toBeNull();
    expect(zonedToUtc("2026-11-12", "6pm", "Asia/Kolkata")).toBeNull();
  });
});

describe("formatInZone", () => {
  it("shows the organisation's wall-clock time, not the server's", () => {
    const instant = new Date("2026-11-12T12:30:00.000Z");
    expect(formatInZone(instant, "Asia/Kolkata", { hour: "2-digit", minute: "2-digit" })).toBe("18:00");
  });
});
