import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { occurrenceDeleteTargets } from "./event-store.js";

function series(overrides = {}) {
  return {
    id: "1",
    name: "Jazz",
    startsOn: "2026-09-23",
    endsOn: "2026-12-09",
    repeatUnit: "week",
    skippedDates: [],
    dates: [
      { id: "a", date: "2026-09-23" },
      { id: "b", date: "2026-09-30" },
      { id: "c", date: "2026-10-07" },
    ],
    ...overrides,
  };
}

describe("occurrenceDeleteTargets", () => {
  it("deletes only the chosen night for this", () => {
    const plan = occurrenceDeleteTargets(series(), "2026-09-30", "this");
    assert.equal(plan.mode, "skip");
    assert.deepEqual(
      plan.targets.map((row) => row.date),
      ["2026-09-30"],
    );
  });

  it("ends the series before this night for following", () => {
    const plan = occurrenceDeleteTargets(series(), "2026-09-30", "following");
    assert.equal(plan.mode, "end");
    assert.equal(plan.endsOn, "2026-09-29");
    assert.deepEqual(
      plan.targets.map((row) => row.date),
      ["2026-09-30", "2026-10-07"],
    );
  });

  it("removes the whole one-off series", () => {
    const plan = occurrenceDeleteTargets(
      series({
        repeatUnit: "none",
        endsOn: "",
        dates: [{ id: "a", date: "2026-10-24" }],
      }),
      "2026-10-24",
      "this",
    );
    assert.equal(plan.mode, "series");
  });
});
