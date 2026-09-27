import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  parseNightSchedule,
  serializeNightSchedule,
  toSanityNightSchedule,
} from "./night-schedule.js";

describe("night-schedule", () => {
  it("parses and serializes labelled slots", () => {
    const raw = JSON.stringify([
      { label: "Open decks", startTime: "16:00", endTime: "22:00" },
      { label: "Chess", start: "19:00", end: "22:00" },
      { label: "  ", startTime: "20:00", endTime: "21:00" },
    ]);
    const parsed = parseNightSchedule(raw);
    assert.deepEqual(parsed, [
      { label: "Open decks", startTime: "16:00", endTime: "22:00" },
      { label: "Chess", startTime: "19:00", endTime: "22:00" },
    ]);
    assert.equal(serializeNightSchedule(parsed), JSON.stringify(parsed));
  });

  it("adds Sanity keys for publish", () => {
    const rows = toSanityNightSchedule([
      { label: "Open decks", startTime: "16:00", endTime: "22:00" },
    ]);
    assert.equal(rows[0]._type, "slot");
    assert.ok(rows[0]._key);
    assert.equal(rows[0].label, "Open decks");
  });
});
