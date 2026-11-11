import { describe, expect, it } from "vitest";
import { daysAway, londonToday, weekStart } from "./london-day.js";

describe("londonToday", () => {
  it("is the day at the bar, not the visitor's", () => {
    // 23:30 UTC in summer is already tomorrow in London
    expect(londonToday(new Date("2026-07-01T23:30:00Z"))).toBe("2026-07-02");
    expect(londonToday(new Date("2026-11-10T23:30:00Z"))).toBe("2026-11-10");
  });
});

describe("daysAway", () => {
  it("counts whole days, across a month and a clock change", () => {
    expect(daysAway("2026-11-10", "2026-11-10")).toBe(0);
    expect(daysAway("2026-11-01", "2026-10-24")).toBe(8);
    expect(daysAway("2026-11-09", "2026-11-10")).toBe(-1);
  });
});

describe("weekStart", () => {
  it("is the Monday of the week, Sunday being its last day", () => {
    expect(weekStart("2026-11-11")).toBe("2026-11-09");
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
    expect(weekStart("2026-11-15")).toBe("2026-11-09");
  });

  it("goes back over a month and a year", () => {
    expect(weekStart("2027-01-02")).toBe("2026-12-28");
  });
});
