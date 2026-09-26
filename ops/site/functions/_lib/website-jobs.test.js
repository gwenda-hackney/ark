import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calendarNightsBehind } from "./event-calendar-sync.js";
import { contentSignature, currentFailure, jobsFrom, parseFailures, prepNeeded } from "./website-jobs.js";

function series(id, { preview = "current", link = "", description = "Tuesday nights." } = {}) {
  return {
    id,
    name: `Series ${id}`,
    slug: `series-${id}`,
    description,
    repeatUnit: "none",
    startsOn: "2099-01-06",
    publish: { preview, live: "current", previewDates: ["2099-01-06"] },
    dates: [{ id: `${id}01`, date: "2099-01-06", googleCalendarEventId: link }],
  };
}

describe("website jobs", () => {
  it("nights without a calendar entry are behind", () => {
    assert.equal(calendarNightsBehind(series("1"), "2099-01-01"), 1);
    assert.equal(calendarNightsBehind(series("1", { link: "gid|stale-hash" }), "2099-01-01"), 1);
    // Past nights are left alone.
    assert.equal(calendarNightsBehind(series("1"), "2099-02-01"), 0);
  });

  it("an event needs work when preview or the calendar is behind", () => {
    assert.equal(prepNeeded(series("1"), { calendar: false }), null);
    assert.deepEqual(prepNeeded(series("1", { preview: "stale" }), { calendar: false }), {
      calendarBehind: 0,
      preview: true,
    });
    assert.equal(prepNeeded(series("1"), { calendar: true }).calendarBehind, 1);
    // Nothing upcoming: nothing to do.
    assert.equal(prepNeeded({ ...series("1", { preview: "stale" }), publish: { preview: "stale", previewDates: [] } }), null);
  });

  it("an ended series still needs its website nights marked removed", () => {
    const ended = {
      ...series("2", { preview: "stale" }),
      startsOn: "",
      publish: { preview: "stale", previewDates: [] },
      dates: [{ id: "201", date: "2099-01-06", sanityId: "event-series-2-2099-01-06" }],
    };
    assert.deepEqual(prepNeeded(ended, { calendar: true }), { calendarBehind: 0, preview: true });
    // Once marked, the row goes and there is nothing left to do.
    assert.equal(prepNeeded({ ...ended, dates: [] }), null);
  });

  it("a failure holds until the event changes", () => {
    const event = series("7", { preview: "stale" });
    const failures = { 7: { message: "Description is required.", at: "t", signature: contentSignature(event) } };
    assert.equal(currentFailure(failures, event).message, "Description is required.");
    const edited = series("7", { preview: "stale", description: "Now with a description." });
    assert.equal(currentFailure(failures, edited), null);

    const jobs = jobsFrom([event, series("8", { preview: "stale" }), series("9")], failures, { calendar: false });
    assert.deepEqual(
      jobs.map((job) => `${job.eventId}:${job.state}`),
      ["7:failed", "8:waiting"],
    );
  });

  it("ignores unreadable failure state", () => {
    assert.deepEqual(parseFailures("not json"), {});
    assert.deepEqual(parseFailures("[1]"), {});
  });
});
