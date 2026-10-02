/**
 * Use cases: what an editor does with events in ops, end to end through the
 * real API handlers, with Baserow, Sanity and Google faked (_test/fake-world.js).
 * Each test checks what the editor sees (the event's status line) as well as
 * what reached the calendar and the website.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";
import { eventHeaderFlag } from "./event-header-status.ts";
import { callApi, createFakeWorld } from "../testing/fake-world.js";
import {
  onRequestPut as addNight,
  onRequestDelete as deleteNight,
  onRequestPatch as editNight,
} from "../../functions/api/events/[id]/dates/[date].js";
import { onRequestPost as publishEvent } from "../../functions/api/events/[id]/publish.js";
import {
  onRequestDelete as deleteEvent,
  onRequestGet as getEvent,
  onRequestPatch as editEvent,
} from "../../functions/api/events/[id].js";
import { onRequestPost as createEvent } from "../../functions/api/events/index.js";
import { onRequestPost as syncCalendar } from "../../functions/api/events/[id]/calendar-sync.js";
import { onRequestDelete as removeImage, onRequestPost as uploadImage } from "../../functions/api/events/[id]/image.js";
import { onRequestPost as uploadNightImage } from "../../functions/api/events/[id]/dates/[date]/image.js";
import { onRequestPost as runWebsiteJob } from "../../functions/api/web/jobs.js";
import { onRequestPost as release } from "../../functions/api/web/release.js";

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
    /** Delete one night (`scope`: this, following, all), as the night's Delete button does. */
    async deleteNight(event, date, scope = "this") {
      const res = await callApi(world, deleteNight, {
        method: "DELETE",
        path: `/api/events/${id(event)}/dates/${date}`,
        params: { id: id(event), date },
        body: { scope },
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      return res.data;
    },
    async deleteEvent(event) {
      const res = await callApi(world, deleteEvent, {
        method: "DELETE",
        path: `/api/events/${id(event)}`,
        params: { id: id(event) },
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      return res.data;
    },
    /** Website → Dev tools → Discard (admin; everyone is an admin on dev). */
    async discardPreview(ids) {
      const res = await callApi(world, release, {
        method: "POST",
        path: "/api/web/release",
        body: { confirm: "preview", direction: "discard", ...(ids ? { ids } : {}) },
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      return res.data;
    },
    /** Upload a photo: the series' main image, or with `date` one night's own. */
    async uploadImage(event, { name = "flyer.jpg", type = "image/jpeg", bytes = 2048, date } = {}) {
      const form = new FormData();
      form.set("file", new File([new Uint8Array(bytes).fill(7)], name, { type }));
      const path = date ? `/api/events/${id(event)}/dates/${date}/image` : `/api/events/${id(event)}/image`;
      return callApi(world, date ? uploadNightImage : uploadImage, {
        method: "POST",
        path,
        params: date ? { id: id(event), date } : { id: id(event) },
        body: form,
      });
    },
    async removeImage(event) {
      const res = await callApi(world, removeImage, {
        method: "DELETE",
        path: `/api/events/${id(event)}/image?role=main`,
        params: { id: id(event) },
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      return res.data.event;
    },
    /** The event's "Sync calendar" button. */
    async syncCalendar(event) {
      const res = await callApi(world, syncCalendar, {
        method: "POST",
        path: `/api/events/${id(event)}/calendar-sync`,
        params: { id: id(event) },
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

/** Dates with a Google Calendar entry. */
function calendarDates(world) {
  return world.google
    .calendar()
    .map((entry) => (entry.start?.dateTime || entry.start?.date || "").slice(0, 10))
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

// Deleting is immediate today: the nights leave the preview, the live site and
// the calendar together. #23 makes it wait for Update website; these change then.
describe("events: deleting", () => {
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

  it("one night: gone from the website and the calendar, the rest untouched", async () => {
    const [first, second, third] = liveNights(world);
    await ops.deleteNight(event, second, "this");
    await ops.waitUntilReady(event);
    assert.ok(!liveNights(world).includes(second), "off the live site");
    assert.ok(!previewNights(world).includes(second), "off the preview");
    assert.ok(!calendarDates(world).includes(second), "off the calendar");
    assert.ok(liveNights(world).includes(first) && liveNights(world).includes(third));
    assert.ok(!(await ops.open(event)).dates.some((row) => row.date === second), "not in ops");
    assert.equal(await ops.sees(event), "On the website");
  });

  it("this and following nights: the series ends before that night", async () => {
    const nights = liveNights(world);
    const from = nights[2];
    await ops.deleteNight(event, from, "following");
    await ops.waitUntilReady(event);
    assert.deepEqual(liveNights(world), nights.slice(0, 2));
    assert.deepEqual(calendarDates(world), nights.slice(0, 2));
    assert.ok((await ops.open(event)).endsOn < from, "Ends on moves before the deleted night");
  });

  it("all future nights of a series that hasn't started: the whole event goes", async () => {
    const res = await ops.deleteNight(event, liveNights(world)[1], "all");
    assert.equal(res.deleted, true, "ops reports the event deleted, so the screen leaves it");
    assert.deepEqual(world.sanity.published(), []);
    assert.deepEqual(world.google.calendar(), []);
    assert.equal(world.baserow.rows("Events").length, 0);
  });

  it("all future nights of a running series: it ends yesterday, past nights stay", async () => {
    const running = await ops.create(
      weeklySeries({ name: "Tuesday Quiz", weekdays: ["tue"], startsOn: daysFromNow(-20), endsOn: daysFromNow(40) }),
    );
    await ops.waitUntilReady(running);
    await ops.updateWebsite(running);
    const quizNights = () =>
      world.sanity
        .published("event")
        .filter((doc) => doc.seriesId === running.slug)
        .map((doc) => doc.date)
        .sort();
    const today = daysFromNow(0);
    const upcoming = quizNights().filter((date) => date >= today);
    assert.ok(upcoming.length > 1);
    await ops.deleteNight(running, upcoming[0], "all");
    await ops.waitUntilReady(running);
    assert.ok(quizNights().every((date) => date < today), "no upcoming quiz nights live");
    assert.equal((await ops.open(running)).endsOn, daysFromNow(-1));
    assert.ok(liveNights(world).length > quizNights().length, "the chess series is untouched");
  });

  it("the whole series: its pages, nights, calendar entries and ops record all go", async () => {
    await ops.deleteEvent(event);
    assert.deepEqual(world.sanity.published(), []);
    assert.deepEqual(world.sanity.drafts(), []);
    assert.deepEqual(world.google.calendar(), []);
    assert.equal(world.baserow.rows("Events").length, 0);
    assert.equal(world.baserow.rows("Event dates").length, 0);
  });

  it("a series that never went live: its preview copy goes, the website is untouched", async () => {
    const draftOnly = await ops.create(weeklySeries({ name: "Tuesday Quiz", weekdays: ["tue"] }));
    await ops.waitUntilReady(draftOnly);
    const liveBefore = world.sanity.published().length;
    await ops.deleteEvent(draftOnly);
    assert.equal(world.sanity.published().length, liveBefore, "the other series stays live");
    assert.ok(
      !world.sanity.drafts().some((doc) => String(doc.title || "").startsWith("Tuesday Quiz")),
      "no preview copy left",
    );
  });

  it("a one-off special event: off the website and the calendar", async () => {
    const date = daysFromNow(12);
    const special = await ops.create({
      name: "Andy Caruso",
      shortDescription: "Vinyl only.",
      description: "The king of disco is back.",
      startTime: "20:00",
      endTime: "01:00",
      startsOn: date,
      repeatUnit: "once",
    });
    await ops.waitUntilReady(special);
    await ops.updateWebsite(special);
    await ops.deleteEvent(special);
    assert.ok(!liveNights(world).includes(date));
    assert.ok(!world.sanity.published("eventSeries").some((doc) => doc.title === "Andy Caruso"));
    assert.ok(!calendarDates(world).includes(date));
  });
});

describe("events: changing the schedule drops nights", () => {
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

  it("ending the series earlier: dropped nights leave the preview now and the website on Update website", async () => {
    const nights = liveNights(world);
    await ops.edit(event, { endsOn: nights[2] });
    await ops.waitUntilReady(event);
    assert.deepEqual(previewNights(world), nights.slice(0, 3), "preview: only the nights still scheduled");
    assert.deepEqual(liveNights(world), nights, "live site unchanged until Update website");
    assert.deepEqual(calendarDates(world), nights.slice(0, 3), "calendar follows the schedule straight away");
    assert.equal(await ops.sees(event), "Website has an older version");

    await ops.updateWebsite(event);
    assert.deepEqual(liveNights(world), nights.slice(0, 3));
    assert.deepEqual(world.sanity.drafts(), []);
    assert.equal(await ops.sees(event), "On the website");
  });

  // Known bug #20: discarding the removed-night draft leaves the night live
  // with no row in ops, and nothing marks it removed again.
  it.fails("discarding a dropped night's draft: ops marks it removed again (known bug #20)", async () => {
    const nights = liveNights(world);
    await ops.edit(event, { endsOn: nights[2] });
    await ops.waitUntilReady(event);
    await ops.discardPreview();
    await ops.waitUntilReady(event);
    assert.deepEqual(previewNights(world), nights.slice(0, 3), "the schedule still excludes the dropped nights");
    assert.equal(await ops.sees(event), "Website has an older version");
  });
});

describe("events: images", () => {
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

  const seriesImage = (doc) => doc?.heroImage?.asset?._ref || "";

  it("adding a photo: on the preview once ready, live on Update website", async () => {
    const res = await ops.uploadImage(event);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    await ops.waitUntilReady(event);
    const preview = world.sanity.view("previewDrafts").find((doc) => doc._type === "eventSeries");
    assert.ok(seriesImage(preview), "the preview series has the photo");
    assert.equal(seriesImage(world.sanity.published("eventSeries")[0]), "", "the live site doesn't yet");
    assert.equal(await ops.sees(event), "Website has an older version");

    await ops.updateWebsite(event);
    assert.ok(seriesImage(world.sanity.published("eventSeries")[0]), "live after Update website");
    assert.equal(await ops.sees(event), "On the website");
  });

  it("replacing the photo puts the new one live", async () => {
    await ops.uploadImage(event, { name: "first.jpg" });
    await ops.waitUntilReady(event);
    await ops.updateWebsite(event);
    const first = seriesImage(world.sanity.published("eventSeries")[0]);
    await ops.uploadImage(event, { name: "second.jpg", bytes: 4096 });
    await ops.waitUntilReady(event);
    await ops.updateWebsite(event);
    const second = seriesImage(world.sanity.published("eventSeries")[0]);
    assert.ok(second && second !== first, "a different photo is live");
  });

  it("removing the photo takes it off the website on Update website", async () => {
    await ops.uploadImage(event);
    await ops.waitUntilReady(event);
    await ops.updateWebsite(event);
    await ops.removeImage(event);
    await ops.waitUntilReady(event);
    await ops.updateWebsite(event);
    assert.equal(seriesImage(world.sanity.published("eventSeries")[0]), "");
    assert.equal(await ops.sees(event), "On the website");
  });

  it("a night's own photo shows on that night only", async () => {
    const [first, second] = liveNights(world);
    const res = await ops.uploadImage(event, { name: "guest.jpg", date: second });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    await ops.waitUntilReady(event);
    await ops.updateWebsite(event);
    const byDate = new Map(world.sanity.published("event").map((doc) => [doc.date, doc]));
    assert.ok(byDate.get(second).heroImage?.asset?._ref, "the night has its own photo");
    assert.ok(!byDate.get(first).heroImage?.asset?._ref, "other nights don't");
  });

  it("refuses files that aren't images, and images over 6 MB", async () => {
    const pdf = await ops.uploadImage(event, { name: "menu.pdf", type: "application/pdf" });
    assert.equal(pdf.status, 400);
    assert.match(pdf.data.error, /JPEG, PNG, WebP, or GIF/);
    const huge = await ops.uploadImage(event, { bytes: 6 * 1024 * 1024 + 1 });
    assert.equal(huge.status, 400);
    assert.match(huge.data.error, /6MB/);
  });
});

describe("events: Google Calendar", () => {
  let world;
  let ops;
  let event;
  beforeEach(async () => {
    world = await createFakeWorld();
    world.install();
    ops = editor(world);
    event = await ops.create(weeklySeries());
    await ops.waitUntilReady(event);
  });
  afterEach(() => world.restore());

  it("new times reach every night's calendar entry", async () => {
    await ops.edit(event, { startTime: "18:30", endTime: "22:30" });
    await ops.waitUntilReady(event);
    const starts = world.google.calendar().map((entry) => entry.start?.dateTime || "");
    assert.ok(starts.length > 0);
    assert.ok(starts.every((start) => start.slice(11, 16) === "18:30"), starts.join(", "));
  });

  // Known bug #70: sync skips unchanged nights without checking the entry exists.
  it.fails("an entry deleted by hand in Google Calendar comes back with Sync calendar (known bug #70)", async () => {
    const [victim] = world.google.calendar();
    const date = (victim.start?.dateTime || victim.start?.date).slice(0, 10);
    world.google.calendarEvents.delete(victim.id);
    await ops.syncCalendar(event);
    assert.ok(calendarDates(world).includes(date));
    assert.equal(calendarDates(world).length, new Set(calendarDates(world)).size, "no duplicates");
  });

  it("syncing twice changes nothing", async () => {
    const before = world.google.calendar().map((entry) => entry.id).sort();
    await ops.syncCalendar(event);
    await ops.syncCalendar(event);
    assert.deepEqual(world.google.calendar().map((entry) => entry.id).sort(), before);
  });
});
