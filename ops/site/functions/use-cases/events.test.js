/**
 * Use cases: what an editor does with events in ops, end to end through the
 * real API handlers, with Baserow, Sanity and Google faked (_test/fake-world.js).
 * Each test checks what the editor sees (the event's status line) as well as
 * what reached the calendar and the website.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";
import { eventHeaderFlag } from "../../menu-app/src/lib/event-header-status.ts";
import { callApi, createFakeWorld } from "../_test/fake-world.js";
import { onRequestPut as addNight, onRequestPatch as editNight } from "../api/events/[id]/dates/[date].js";
import { onRequestPost as publishEvent } from "../api/events/[id]/publish.js";
import { onRequestGet as getEvent, onRequestPatch as editEvent } from "../api/events/[id].js";
import { onRequestPost as createEvent } from "../api/events/index.js";
import { onRequestPost as runWebsiteJob } from "../api/web/jobs.js";

/** ISO date `days` from today. */
function daysFromNow(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The first date after today on `weekday` (0 = Sunday). */
function nextWeekday(weekday) {
  for (let days = 1; days <= 7; days += 1) {
    const iso = daysFromNow(days);
    if (new Date(`${iso}T12:00:00Z`).getUTCDay() === weekday) return iso;
  }
  throw new Error("unreachable");
}

function addDays(iso, days) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const WEDNESDAY = 3;

function weeklySeries(overrides = {}) {
  return {
    name: "Negroni Chess Society",
    shortDescription: "Chess by the canal.",
    description: "Boards out, negronis poured.",
    startTime: "19:00",
    endTime: "23:00",
    startsOn: nextWeekday(WEDNESDAY),
    endsOn: daysFromNow(60),
    repeatUnit: "week",
    repeatEvery: 1,
    weekdays: ["wed"],
    ...overrides,
  };
}

/** Everything an editor does, as API calls against one fake world. */
function editor(world) {
  const id = (event) => String(event.id ?? event);
  return {
    async create(body) {
      const res = await callApi(world, createEvent, { method: "POST", path: "/api/events", body });
      assert.equal(res.status, 201, JSON.stringify(res.data));
      return res.data.event;
    },
    async tryCreate(body) {
      return callApi(world, createEvent, { method: "POST", path: "/api/events", body });
    },
    async edit(event, body) {
      const res = await callApi(world, editEvent, {
        method: "PATCH",
        path: `/api/events/${id(event)}`,
        params: { id: id(event) },
        body,
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      return res.data.event;
    },
    async addNight(event, date, body = {}) {
      const res = await callApi(world, addNight, {
        method: "PUT",
        path: `/api/events/${id(event)}/dates/${date}`,
        params: { id: id(event), date },
        body,
      });
      assert.ok([200, 201].includes(res.status), JSON.stringify(res.data));
      return res.data;
    },
    async editNight(event, date, body) {
      const res = await callApi(world, editNight, {
        method: "PATCH",
        path: `/api/events/${id(event)}/dates/${date}`,
        params: { id: id(event), date },
        body,
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      return res.data;
    },
    /** Let the background job finish (calendar + preview copy). */
    async waitUntilReady(event) {
      for (let step = 0; step < 20; step += 1) {
        const res = await callApi(world, runWebsiteJob, {
          method: "POST",
          path: "/api/web/jobs",
          body: { eventId: id(event) },
        });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal(res.data.failed || "", "", `website job failed: ${res.data.failed}`);
        if (res.data.done) return;
      }
      throw new Error("the website job never finished");
    },
    async updateWebsite(event) {
      const res = await callApi(world, publishEvent, {
        method: "POST",
        path: `/api/events/${id(event)}/publish`,
        params: { id: id(event) },
        body: { target: "production", confirm: "production" },
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      return res.data;
    },
    async open(event) {
      const res = await callApi(world, getEvent, { path: `/api/events/${id(event)}`, params: { id: id(event) } });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      return res.data.event;
    },
    /** The status line the editor sees on the event. */
    async sees(event) {
      return eventHeaderFlag((await this.open(event)).publish, false).label;
    },
  };
}

/** Night documents on the live site, by date. */
function liveNights(world) {
  return world.sanity
    .published("event")
    .map((doc) => doc.date)
    .sort();
}

/** Night documents the preview shows (drafts over live, minus nights marked removed). */
function previewNights(world) {
  return world.sanity
    .view("previewDrafts")
    .filter((doc) => doc._type === "event" && !doc.removed)
    .map((doc) => doc.date)
    .sort();
}

describe("events: creating", () => {
  let world;
  let ops;
  beforeEach(async () => {
    world = await createFakeWorld();
    world.install();
    ops = editor(world);
  });
  afterEach(() => world.restore());

  it("a weekly series: saved, got ready in the background, then live on Update website", async () => {
    const event = await ops.create(weeklySeries());

    assert.equal(world.baserow.rows("Events").length, 1);
    assert.deepEqual(
      world.google.eventFolders().map((folder) => folder.name),
      ["Negroni Chess Society"],
      "a Drive folder for its photos",
    );
    assert.equal(await ops.sees(event), "Not on the website yet");

    await ops.waitUntilReady(event);
    const nights = world.baserow.rows("Event dates").map((row) => row.Date).sort();
    assert.ok(nights.length >= 8, `about nine Wednesdays in 60 days, got ${nights.length}`);
    assert.ok(nights.every((date) => new Date(`${date}T12:00:00Z`).getUTCDay() === WEDNESDAY));
    assert.equal(world.google.calendar().length, nights.length, "every night is in Google Calendar");
    assert.equal(world.sanity.published().length, 0, "nothing live before Update website");
    assert.equal(await ops.sees(event), "Not on the website yet");

    await ops.updateWebsite(event);
    const [series] = world.sanity.published("eventSeries");
    assert.equal(series.title, "Negroni Chess Society");
    assert.equal(series.schedule, "repeating");
    assert.equal(series.shortDescription, "Chess by the canal.");
    assert.deepEqual(liveNights(world), nights);
    assert.equal(world.sanity.drafts().length, 0, "no drafts left over");
    assert.equal(await ops.sees(event), "On the website");
  });

  it("every other week: only alternate Wednesdays", async () => {
    const start = nextWeekday(WEDNESDAY);
    const event = await ops.create(weeklySeries({ repeatEvery: 2, startsOn: start, endsOn: addDays(start, 42) }));
    await ops.waitUntilReady(event);
    const nights = world.baserow.rows("Event dates").map((row) => row.Date).sort();
    assert.deepEqual(nights, [0, 14, 28, 42].map((days) => addDays(start, days)));
  });

  it("monthly on a date: the same day each month", async () => {
    const start = daysFromNow(10);
    const event = await ops.create(
      weeklySeries({ name: "Vinyl Swap", repeatUnit: "month", weekdays: [], startsOn: start, endsOn: daysFromNow(100) }),
    );
    await ops.waitUntilReady(event);
    const days = new Set(world.baserow.rows("Event dates").map((row) => row.Date.slice(8)));
    assert.deepEqual([...days], [start.slice(8)]);
  });

  it("a special one-off event: a single night, shown as a one-off", async () => {
    const date = daysFromNow(12);
    const event = await ops.create({
      name: "Andy Caruso",
      shortDescription: "Vinyl only.",
      description: "The king of disco is back.",
      artist: "Andy Caruso",
      startTime: "20:00",
      endTime: "01:00",
      startsOn: date,
      repeatUnit: "once",
    });
    await ops.waitUntilReady(event);
    await ops.updateWebsite(event);
    const [series] = world.sanity.published("eventSeries");
    assert.equal(series.schedule, "once");
    assert.deepEqual(liveNights(world), [date]);
    assert.equal(world.google.calendar().length, 1);
    assert.equal(await ops.sees(event), "On the website");
  });

  it("refuses a second series with the same name", async () => {
    await ops.create(weeklySeries());
    const again = await ops.tryCreate(weeklySeries());
    assert.ok(again.status >= 400 && again.status < 500, `expected a refusal, got ${again.status}`);
    assert.equal(world.baserow.rows("Events").length, 1);
  });

  it("refuses times that aren't 24-hour, and a recurring series without an end date", async () => {
    const badTime = await ops.tryCreate(weeklySeries({ startTime: "7pm" }));
    assert.equal(badTime.status, 400);
    assert.match(badTime.data.error, /24-hour/);
    const noEnd = await ops.tryCreate(weeklySeries({ endsOn: "" }));
    assert.equal(noEnd.status, 400);
    assert.match(noEnd.data.error, /end date/);
    assert.equal(world.baserow.rows("Events").length, 0, "nothing saved");
  });
});

describe("events: editing", () => {
  let world;
  let ops;
  let event;
  beforeEach(async () => {
    world = await createFakeWorld();
    world.install();
    ops = editor(world);
    event = await ops.create(weeklySeries());
    await ops.waitUntilReady(event);
    await ops.updateWebsite(event);
  });
  afterEach(() => world.restore());

  it("a change to the series waits for Update website", async () => {
    await ops.edit(event, { shortDescription: "Chess, negronis, the canal." });
    await ops.waitUntilReady(event);
    assert.equal(await ops.sees(event), "Website has an older version");
    assert.equal(world.sanity.published("eventSeries")[0].shortDescription, "Chess by the canal.", "live copy unchanged");

    await ops.updateWebsite(event);
    assert.equal(world.sanity.published("eventSeries")[0].shortDescription, "Chess, negronis, the canal.");
    assert.equal(await ops.sees(event), "On the website");
    assert.deepEqual(world.sanity.drafts().map((doc) => doc._id), [], "no drafts left behind");
  });

  it("a new web address: the old one is kept so the website can redirect it", async () => {
    const before = world.sanity.published("eventSeries")[0].slug.current;
    await ops.edit(event, { slug: "negroni-chess" });
    await ops.waitUntilReady(event);
    await ops.updateWebsite(event);
    const series = world.sanity.published("eventSeries");
    assert.equal(series.length, 1, "one series document, not two");
    assert.equal(series[0].slug.current, "negroni-chess");
    assert.deepEqual(series[0].formerSlugs, [before]);
  });

  it("a night added outside the pattern goes live with the series", async () => {
    const extra = addDays(nextWeekday(WEDNESDAY), 2); // a Friday
    await ops.addNight(event, extra);
    await ops.waitUntilReady(event);
    assert.equal(await ops.sees(event), "Website has an older version");
    await ops.updateWebsite(event);
    assert.ok(liveNights(world).includes(extra));
    assert.ok(world.google.calendar().some((entry) => (entry.start?.dateTime || entry.start?.date || "").startsWith(extra)));
  });

  it("one night's own details change only that night", async () => {
    const [first, second] = liveNights(world);
    await ops.editNight(event, second, { name: "Grandmaster night", artist: "Guest: Hackney Chess Club" });
    await ops.waitUntilReady(event);
    await ops.updateWebsite(event);
    const byDate = new Map(world.sanity.published("event").map((doc) => [doc.date, doc]));
    assert.equal(byDate.get(second).title, "Grandmaster night");
    assert.notEqual(byDate.get(first).title, "Grandmaster night");
  });

  it("moving a night takes it off its old date", async () => {
    const [, second] = liveNights(world);
    const moved = addDays(second, 1);
    await ops.editNight(event, second, { date: moved });
    await ops.waitUntilReady(event);
    assert.ok(previewNights(world).includes(moved), "preview: on the new date");
    assert.ok(!previewNights(world).includes(second), "preview: off the old date");
    assert.ok(liveNights(world).includes(second), "live site unchanged until Update website");
    await ops.updateWebsite(event);
    const nights = liveNights(world);
    assert.ok(nights.includes(moved), "on the new date");
    assert.ok(!nights.includes(second), "off the old date");
  });
});
