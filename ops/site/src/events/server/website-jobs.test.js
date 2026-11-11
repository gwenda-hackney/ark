import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { calendarNightsBehind } from "./event-calendar-sync.js";
import { occurrenceHash } from "./event-content.js";
import { liveNightsBehind } from "./event-model.js";
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
    assert.deepEqual(prepNeeded(event), { calendarBehind: 0, preview: true, live: false });
    const seriesPreviews = { 4: seriesPreviewHash(event) };
    assert.equal(prepNeeded(event, { seriesPreviews }).preview, false, "staged; the website is next");
    const seriesLive = seriesPreviews;
    assert.equal(prepNeeded(event, { seriesPreviews, seriesLive }), null);
    // Editing it after staging puts it back in the queue.
    assert.equal(prepNeeded(waiting("4", "New copy."), { seriesPreviews }).preview, true);
    assert.equal(jobsFrom([event], {}, { seriesPreviews, seriesLive }).length, 0);
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
    assert.deepEqual(prepNeeded(ended, { calendar: true }), { calendarBehind: 0, preview: true, live: false });
    // Once marked, the row goes. With no start date it now waits for dates
    // ("Check back soon for the next date"): staged once, then there is nothing left to do.
    const cleared = { ...ended, dates: [] };
    assert.equal(prepNeeded(cleared).preview, true);
    const staged = { 2: seriesPreviewHash(cleared) };
    assert.equal(prepNeeded(cleared, { seriesPreviews: staged, seriesLive: staged }), null);
  });

  it("once the preview is in step, the website itself is next; not when that is turned off", () => {
    const base = series("5");
    const hash = occurrenceHash(base, base.dates[0]);
    const staged = (production) => ({
      ...base,
      publish: { preview: "current", live: production ? "current" : "stale", previewDates: ["2099-01-06"] },
      dates: [
        {
          ...base.dates[0],
          sanityId: "event-series-5-2099-01-06",
          snapshots: { preview: { hash }, ...(production ? { production: { hash: production } } : {}) },
        },
      ],
    });
    const options = { calendar: false };
    assert.equal(liveNightsBehind(staged()), 1, "never on the website");
    assert.equal(liveNightsBehind(staged("an older version")), 1, "the website has an older version");
    assert.equal(liveNightsBehind(staged(hash)), 0);
    assert.deepEqual(prepNeeded(staged(), options), { calendarBehind: 0, preview: false, live: true });
    assert.equal(prepNeeded(staged(hash), options), null);
    assert.equal(prepNeeded(staged(), { ...options, autoUpdate: false }), null, "it waits for Update website");
    assert.deepEqual(jobsFrom([staged()], {}, options).map((job) => job.state), ["waiting"]);

    // A night dropped from the schedule, marked removed on the preview, is still on the website.
    const dropped = {
      ...staged(hash),
      dates: [
        ...staged(hash).dates,
        { id: "502", date: "2099-01-13", sanityId: "event-series-5-2099-01-13", snapshots: { preview: { removed: true } } },
      ],
    };
    assert.equal(liveNightsBehind(dropped), 1);
    assert.equal(prepNeeded(dropped, options).live, true);

    // A deleted event is never taken off by the job: it waits on the Website page, with Restore.
    assert.equal(prepNeeded({ ...staged(), deletedAt: "2099-01-01T00:00:00Z" }, options), null);
  });

  it("a series waiting for dates goes on the website once its preview copy is staged", () => {
    const event = waiting("4");
    const hash = seriesPreviewHash(event);
    assert.equal(prepNeeded(event, { seriesPreviews: { 4: hash } }).live, true);
    assert.equal(prepNeeded(event, { seriesPreviews: { 4: hash }, seriesLive: { 4: hash } }), null);
    assert.equal(prepNeeded(event, { seriesPreviews: { 4: hash }, seriesLive: { 4: "older" } }).live, true);
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
