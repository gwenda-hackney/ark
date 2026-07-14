import { describe, expect, it } from "vitest";
import { formatEventDate, formatEventWhen, getUpcomingEvents } from "./events";
import type { Event } from "../types/events";

const sampleEvents: Event[] = [
  {
    id: "grand-opening",
    title: "Grand Opening",
    date: "2026-08-01",
    description: "Details to follow.",
  },
  {
    id: "past-night",
    title: "Past Night",
    date: "2020-01-01",
    description: "Already happened.",
  },
  {
    id: "winter-supper",
    title: "Winter Supper",
    date: "2026-12-01",
    description: "Seasonal menu.",
  },
];

describe("formatEventDate", () => {
  it("formats ISO dates in en-GB long form", () => {
    expect(formatEventDate("2026-08-01")).toBe("Saturday, 1 August 2026");
  });
});

describe("formatEventWhen", () => {
  it("includes door times when provided", () => {
    expect(formatEventWhen("2026-08-15", "17:00", "23:00")).toBe(
      "Saturday, 15 August 2026, 5pm–11pm",
    );
  });
});

describe("getUpcomingEvents", () => {
  it("drops past events and sorts by date", () => {
    const now = new Date("2026-07-01T12:00:00");
    expect(getUpcomingEvents(sampleEvents, now)).toEqual([
      sampleEvents[0],
      sampleEvents[2],
    ]);
  });

  it("includes events happening today", () => {
    const now = new Date("2026-08-01T18:00:00");
    expect(getUpcomingEvents(sampleEvents, now).map((event) => event.id)).toEqual(
      ["grand-opening", "winter-supper"],
    );
  });
});
