import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { droppedNights, keepsDroppedNight, occurrenceDeleteTargets, previewBehind, publishState } from "./event-store.js";

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

describe("dropping a night from the schedule", () => {
  const today = "2026-09-26";
  const published = { id: "a", date: "2026-09-29", sanityId: "event-jazz-2026-09-29", snapshots: { preview: { hash: "x" } } };

  it("keeps an upcoming night that is on the website", () => {
    assert.equal(keepsDroppedNight(published, today), true);
  });

  it("deletes a night that never reached the website, or is past", () => {
    assert.equal(keepsDroppedNight({ id: "b", date: "2026-09-29" }, today), false);
    assert.equal(keepsDroppedNight({ ...published, date: "2026-09-22" }, today), false);
  });

  it("leaves the event waiting for the website while the kept night is there", () => {
    const event = series({ startsOn: "2026-09-30", endsOn: "2026-10-14", weekdays: ["wed"] });
    const state = publishState(event, [published], today);
    assert.equal(state.preview, "stale");
  });

  it("lists the dropped night and leaves the preview behind until it is marked", () => {
    const event = series({ startsOn: "2026-09-30", endsOn: "2026-10-14", weekdays: ["wed"], dates: [published] });
    assert.deepEqual(droppedNights(event, today).map((row) => row.date), ["2026-09-29"]);
    assert.equal(previewBehind(event, today), true);
    assert.equal(previewBehind({ ...event, dates: [], publish: { preview: "current", previewDates: ["2026-09-30"] } }, today), false);
  });
});
