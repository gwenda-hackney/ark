import { describe, expect, it } from "vitest";
import { diaryCacheControl, pageEventFeed } from "./event-feed.js";

const now = new Date(2026, 8, 22, 15, 0, 0);

function night(id, date) {
  return {
    id,
    date,
    title: id,
    recurrence: id.startsWith("jazz") ? "Every Wednesday" : "",
  };
}

describe("pageEventFeed", () => {
  const events = [
    night("past", "2026-09-01"),
    night("jazz-1", "2026-09-23"),
    night("vinyl", "2026-10-10"),
    night("jazz-2", "2026-09-30"),
    night("jazz-1-late", "2026-09-23"),
  ];

  it("drops past nights and returns the next page cursor", () => {
    const page = pageEventFeed(events, { limit: 2, now });
    expect(page.events.map((event) => event.id)).toEqual([
      "jazz-1",
      "jazz-1-late",
    ]);
    expect(page.next).toEqual({ after: "2026-09-23", afterId: "jazz-1-late" });
  });

  it("continues after the last shown night", () => {
    const page = pageEventFeed(events, {
      after: "2026-09-23",
      afterId: "jazz-1-late",
      limit: 2,
      now,
    });
    expect(page.events.map((event) => event.id)).toEqual(["jazz-2", "vinyl"]);
    expect(page.next).toBeNull();
  });
});

describe("diaryCacheControl", () => {
  it("caches the diary the same way on dev and production", () => {
    expect(diaryCacheControl({ SITE_ENV: "dev" })).toBe("public, max-age=60");
    expect(diaryCacheControl({ SITE_ENV: "production" })).toBe(
      "public, max-age=60",
    );
  });
});
