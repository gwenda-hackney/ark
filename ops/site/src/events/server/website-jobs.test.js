import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { calendarNightsBehind } from "./event-calendar-sync.js";
import { seriesPreviewHash } from "./event-publish.js";
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

function waiting(id, description = "Jazz on Wednesdays.") {
  return {
    id,
    name: "The Jazz Room",
    slug: "the-jazz-room",
    description,
    repeatUnit: "week",
    weekdays: ["wed"],
    startsOn: "",
    publish: { preview: "unpublished", live: "unpublished", previewDates: [] },
    dates: [],
  };
}

describe("website jobs", () => {
  it("a series waiting for dates is staged until its copy matches", () => {
    const event = waiting("4");
    assert.deepEqual(prepNeeded(event), { calendarBehind: 0, preview: true });
    const seriesPreviews = { 4: seriesPreviewHash(event) };
    assert.equal(prepNeeded(event, { seriesPreviews }), null);
    // Editing it after staging puts it back in the queue.
    assert.equal(prepNeeded(waiting("4", "New copy."), { seriesPreviews }).preview, true);
    assert.equal(jobsFrom([event], {}, { seriesPreviews }).length, 0);
    assert.notEqual(contentSignature(event), contentSignature(waiting("4", "New copy.")));
  });

  it("nights without a calendar entry are behind", () => {
    assert.equal(calendarNightsBehind(series("1"), "2099-01-01"), 1);
    assert.equal(calendarNightsBehind(series("1", { link: "gid|stale-hash" }), "2099-01-01"), 1);
    // Past nights are left alone.
    assert.equal(calendarNightsBehind(series("1"), "2099-02-01"), 0);
  });

  it("an ended series still needs its website nights marked removed", () => {
    const ended = {
      ...series("2", { preview: "stale" }),
      startsOn: "",
      publish: { preview: "stale", previewDates: [] },
      dates: [{ id: "201", date: "2099-01-06", sanityId: "event-series-2-2099-01-06" }],
    };
    assert.deepEqual(prepNeeded(ended, { calendar: true }), { calendarBehind: 0, preview: true });
    // Once marked, the row goes. With no start date it now waits for dates
    // ("Check back soon for the next date"): staged once, then there is nothing left to do.
    const cleared = { ...ended, dates: [] };
    assert.equal(prepNeeded(cleared).preview, true);
    assert.equal(prepNeeded(cleared, { seriesPreviews: { 2: seriesPreviewHash(cleared) } }), null);
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
