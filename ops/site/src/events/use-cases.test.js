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
import { onRequestGet as listEvents, onRequestPost as createEvent } from "../../functions/api/events/index.js";
import { onRequestPost as restoreEvent } from "../../functions/api/events/[id]/restore.js";
import { onRequestPost as syncCalendar } from "../../functions/api/events/[id]/calendar-sync.js";
import { onRequestDelete as removeImage, onRequestPost as uploadImage } from "../../functions/api/events/[id]/image.js";
import { onRequestPost as uploadNightImage } from "../../functions/api/events/[id]/dates/[date]/image.js";
import { onRequestPost as runWebsiteJob } from "../../functions/api/web/jobs.js";
import { onRequestPost as uploadGalleryPhoto } from "../../functions/api/events/[id]/gallery.js";
import { onRequestPost as tick } from "../../functions/api/web/tick.js";
import { onRequestDelete as removeGalleryPhoto } from "../../functions/api/events/[id]/gallery/[key].js";
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
const SATURDAY = 6;

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
    /** Restore on the Website page: undo a delete that hasn't reached the website. */
    async restore(event) {
      const res = await callApi(world, restoreEvent, {
        method: "POST",
        path: `/api/events/${id(event)}/restore`,
        params: { id: id(event) },
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      return res.data;
    },
    /** Website page → Update website: publish everything waiting. */
    async publishAll() {
      const res = await callApi(world, release, {
        method: "POST",
        path: "/api/web/release",
        body: { confirm: "production" },
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      return res.data;
    },
    /** The events list. */
    async list() {
      const res = await callApi(world, listEvents, { path: "/api/events" });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      return res.data.events;
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
        path: `/api/events/${id(event)}/image`,
        params: { id: id(event) },
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      return res.data.event;
    },
    /** Images tab: add a gallery photo, to the series or (`date`) one night. Returns the photo, newest first. */
    async addGalleryPhoto(event, { date = "", name = "crowd.jpg", fill = 3, status = 200 } = {}) {
      const form = new FormData();
      form.set("file", new File([new TextEncoder().encode(name), new Uint8Array(4096).fill(fill)], name, { type: "image/jpeg" }));
      const res = await callApi(world, uploadGalleryPhoto, {
        method: "POST",
        path: `/api/events/${id(event)}/gallery${date ? `?date=${date}` : ""}`,
        params: { id: id(event) },
        body: form,
      });
      assert.equal(res.status, status, JSON.stringify(res.data));
      return res.data.event?.gallery?.[0];
    },
    async removeGalleryPhoto(event, photo) {
      const res = await callApi(world, removeGalleryPhoto, {
        method: "DELETE",
        path: `/api/events/${id(event)}/gallery/${photo.key}`,
        params: { id: id(event), key: photo.key },
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      return res.data.event;
    },
    /** One scheduler run of the Drive copy. */
    async copyToDrive() {
      const res = await callApi(world, tick, {
        method: "POST",
        path: "/api/web/tick?step=drive",
        headers: { Authorization: `Bearer ${world.env.DEPLOY_WEBHOOK_SECRET}` },
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      return res.data.drive;
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
    assert.equal(await ops.sees(event), "Not live");

    await ops.waitUntilReady(event);
    const nights = world.baserow.rows("Event dates").map((row) => row.Date).sort();
    assert.ok(nights.length >= 8, `about nine Wednesdays in 60 days, got ${nights.length}`);
    assert.ok(nights.every((date) => new Date(`${date}T12:00:00Z`).getUTCDay() === WEDNESDAY));
    assert.equal(world.google.calendar().length, nights.length, "every night is in Google Calendar");
    assert.equal(world.sanity.published().length, 0, "nothing live before Update website");
    assert.equal(await ops.sees(event), "Not live");

    await ops.updateWebsite(event);
    const [series] = world.sanity.published("eventSeries");
    assert.equal(series.title, "Negroni Chess Society");
    assert.equal(series.schedule, "repeating");
    assert.equal(series.shortDescription, "Chess by the canal.");
    assert.deepEqual(liveNights(world), nights);
    assert.equal(world.sanity.drafts().length, 0, "no drafts left over");
    assert.equal(await ops.sees(event), "Live");
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
    assert.equal(await ops.sees(event), "Live");
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
    assert.equal(await ops.sees(event), "Changed");
    assert.equal(world.sanity.published("eventSeries")[0].shortDescription, "Chess by the canal.", "live copy unchanged");

    await ops.updateWebsite(event);
    assert.equal(world.sanity.published("eventSeries")[0].shortDescription, "Chess, negronis, the canal.");
    assert.equal(await ops.sees(event), "Live");
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

  it("slots typed on a new night are kept on that night (#151)", async () => {
    const slots = [{ label: "Open decks", startTime: "20:00", endTime: "21:00" }];
    const extra = addDays(nextWeekday(WEDNESDAY), 2); // a Friday, outside the pattern
    const inRule = addDays(nextWeekday(WEDNESDAY), 7);
    await ops.addNight(event, extra, { nightSchedule: slots });
    await ops.addNight(event, inRule, { nightSchedule: slots });
    const saved = await ops.open(event);
    for (const date of [extra, inRule]) {
      const night = saved.dates.find((row) => row.date === date);
      assert.deepEqual(night?.overrides.nightSchedule, slots, `slots on ${date}`);
      assert.equal(saved.dates.filter((row) => row.date === date).length, 1, `one row for ${date}`);
    }
  });

  it("a night added outside the pattern goes live with the series", async () => {
    const extra = addDays(nextWeekday(WEDNESDAY), 2); // a Friday
    await ops.addNight(event, extra);
    await ops.waitUntilReady(event);
    assert.equal(await ops.sees(event), "Changed");
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

  it("one night: off the preview and the calendar now, off the website on Update website", async () => {
    const nights = liveNights(world);
    const [first, second, third] = nights;
    await ops.deleteNight(event, second, "this");
    await ops.waitUntilReady(event);
    assert.ok(!previewNights(world).includes(second), "off the preview");
    assert.ok(!calendarDates(world).includes(second), "off the calendar");
    assert.deepEqual(liveNights(world), nights, "the website waits for Update website");
    assert.equal(await ops.sees(event), "Changed");

    await ops.updateWebsite(event);
    assert.ok(!liveNights(world).includes(second), "off the live site");
    assert.ok(liveNights(world).includes(first) && liveNights(world).includes(third));
    assert.ok(!(await ops.open(event)).dates.some((row) => row.date === second), "not in ops");
    assert.equal(await ops.sees(event), "Live");
  });

  it("this and following nights: the series ends before that night", async () => {
    const nights = liveNights(world);
    const from = nights[2];
    await ops.deleteNight(event, from, "following");
    await ops.waitUntilReady(event);
    assert.deepEqual(previewNights(world), nights.slice(0, 2));
    assert.deepEqual(calendarDates(world), nights.slice(0, 2));
    assert.ok((await ops.open(event)).endsOn < from, "Ends on moves before the deleted night");
    await ops.updateWebsite(event);
    assert.deepEqual(liveNights(world), nights.slice(0, 2));
  });

  it("all future nights of a series that hasn't started: the whole event goes, on Update website", async () => {
    const nights = liveNights(world);
    const res = await ops.deleteNight(event, nights[1], "all");
    assert.equal(res.deleted, true, "ops reports the event deleted, so the screen leaves it");
    assert.equal(res.pending, true, "it is still on the website");
    assert.deepEqual(liveNights(world), nights);
    assert.deepEqual(previewNights(world), []);
    assert.deepEqual(world.google.calendar(), []);
    assert.deepEqual(await ops.list(), [], "not in the events list");

    await ops.publishAll();
    assert.deepEqual(world.sanity.published(), []);
    assert.equal(world.baserow.rows("Events").length, 0);
    assert.equal(world.baserow.rows("Event dates").length, 0);
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
    await ops.updateWebsite(running);
    assert.ok(quizNights().every((date) => date < today), "no upcoming quiz nights live");
    assert.equal((await ops.open(running)).endsOn, daysFromNow(-1));
    assert.ok(liveNights(world).length > quizNights().length, "the chess series is untouched");
  });

  it("the whole series: off the preview and calendar now; its pages and ops record go on Update website", async () => {
    const nights = liveNights(world);
    const res = await ops.deleteEvent(event);
    assert.equal(res.pending, true);
    assert.deepEqual(liveNights(world), nights, "still on the website");
    assert.deepEqual(previewNights(world), []);
    assert.deepEqual(world.google.calendar(), []);
    assert.deepEqual(await ops.list(), []);

    await ops.publishAll();
    assert.deepEqual(world.sanity.published(), []);
    assert.deepEqual(world.sanity.drafts(), []);
    assert.equal(world.baserow.rows("Events").length, 0);
    assert.equal(world.baserow.rows("Event dates").length, 0);
  });

  it("Restore before Update website: the event is back as it was", async () => {
    const nights = liveNights(world);
    await ops.deleteEvent(event);
    await ops.restore(event);
    assert.deepEqual(previewNights(world), nights);
    assert.equal((await ops.list()).length, 1);
    await ops.waitUntilReady(event);
    assert.deepEqual(calendarDates(world), nights, "calendar entries come back");
    assert.equal(await ops.sees(event), "Live");
  });

  it("discarding the deleted event's drafts brings it back in ops", async () => {
    await ops.deleteEvent(event);
    await ops.discardPreview();
    assert.equal((await ops.list()).length, 1);
    await ops.waitUntilReady(event);
    assert.equal(await ops.sees(event), "Live");
  });

  it("a series that never went live: gone at once, the website is untouched", async () => {
    const draftOnly = await ops.create(weeklySeries({ name: "Tuesday Quiz", weekdays: ["tue"] }));
    await ops.waitUntilReady(draftOnly);
    const liveBefore = world.sanity.published().length;
    const res = await ops.deleteEvent(draftOnly);
    assert.equal(res.pending, false);
    assert.equal(world.sanity.published().length, liveBefore, "the other series stays live");
    assert.ok(
      !world.sanity.drafts().some((doc) => String(doc.title || "").startsWith("Tuesday Quiz")),
      "no preview copy left",
    );
    assert.equal(world.baserow.rows("Events").length, 1, "only the live series is left");
  });

  it("one night of an open series: only that night goes, the series stays (#151)", async () => {
    const [first, second] = [addDays(nextWeekday(SATURDAY), 7), addDays(nextWeekday(SATURDAY), 14)];
    const open = await ops.create({
      name: "Gwenda Nights",
      shortDescription: "Something different every time.",
      description: "A night picked by the team.",
      startTime: "20:00",
      endTime: "01:00",
      repeatUnit: "none",
    });
    await ops.addNight(open, first);
    await ops.addNight(open, second);
    await ops.waitUntilReady(open);

    const res = await ops.deleteNight(open, first, "this");
    assert.equal(res.deleted, false, "the series is not deleted");
    await ops.waitUntilReady(open);
    assert.deepEqual((await ops.open(open)).dates.map((row) => row.date), [second]);
    assert.ok(!previewNights(world).includes(first), "off the preview");

    const last = await ops.deleteNight(open, second, "this");
    assert.equal(last.deleted, false, "an open series may have no nights");
    await ops.waitUntilReady(open);
    const left = await ops.open(open);
    assert.equal(left.name, "Gwenda Nights");
    assert.deepEqual(left.dates, []);
    assert.ok((await ops.list()).some((row) => row.id === open.id), "still in the events list");
  });

  it("a one-off special event: off the calendar now, off the website on Update website", async () => {
    // A Saturday, so it never shares a date with the Wednesday series above.
    const date = addDays(nextWeekday(SATURDAY), 7);
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
    assert.ok(!calendarDates(world).includes(date));
    assert.ok(liveNights(world).includes(date), "still live until Update website");
    await ops.publishAll();
    assert.ok(!liveNights(world).includes(date));
    assert.ok(!world.sanity.published("eventSeries").some((doc) => doc.title === "Andy Caruso"));
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
    assert.equal(await ops.sees(event), "Changed");

    await ops.updateWebsite(event);
    assert.deepEqual(liveNights(world), nights.slice(0, 3));
    assert.deepEqual(world.sanity.drafts(), []);
    assert.equal(await ops.sees(event), "Live");
  });

  it("discarding a dropped night's draft: ops marks it removed again", async () => {
    const nights = liveNights(world);
    await ops.edit(event, { endsOn: nights[2] });
    await ops.waitUntilReady(event);
    await ops.discardPreview();
    await ops.waitUntilReady(event);
    assert.deepEqual(previewNights(world), nights.slice(0, 3), "the schedule still excludes the dropped nights");
    assert.equal(await ops.sees(event), "Changed");
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
    assert.equal(await ops.sees(event), "Changed");

    await ops.updateWebsite(event);
    assert.ok(seriesImage(world.sanity.published("eventSeries")[0]), "live after Update website");
    assert.equal(await ops.sees(event), "Live");
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
    assert.equal(await ops.sees(event), "Live");
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

  it("refuses files that aren't images, and images over 20 MB", async () => {
    const pdf = await ops.uploadImage(event, { name: "menu.pdf", type: "application/pdf" });
    assert.equal(pdf.status, 400);
    assert.match(pdf.data.error, /JPEG, PNG, WebP, or GIF/);
    const huge = await ops.uploadImage(event, { bytes: 20 * 1024 * 1024 + 1 });
    assert.equal(huge.status, 400);
    assert.match(huge.data.error, /20MB/);
  });

  it("a photo goes straight to Sanity: the event points at that asset", async () => {
    const res = await ops.uploadImage(event, { name: "flyer.jpg" });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const assets = world.sanity.view("raw").filter((doc) => doc._type === "sanity.imageAsset");
    assert.equal(assets.length, 1, "uploaded before any staging");
    const { mainImage } = await ops.open(event);
    assert.equal(mainImage.asset, assets[0]._id);
    assert.match(mainImage.url, /^https:\/\/cdn\.sanity\.io\/images\//, "ops shows it from the Sanity CDN");

    await ops.waitUntilReady(event);
    await ops.updateWebsite(event);
    assert.equal(seriesImage(world.sanity.published("eventSeries")[0]), assets[0]._id, "the website shows that asset");
  });

  it("the same photo on the series and a night is one asset", async () => {
    const night = liveNights(world)[1];
    await ops.uploadImage(event, { name: "a.jpg" });
    await ops.uploadImage(event, { name: "b.jpg", date: night });
    const assets = world.sanity.view("raw").filter((doc) => doc._type === "sanity.imageAsset");
    assert.equal(assets.length, 1);
    const opened = await ops.open(event);
    assert.equal(opened.mainImage.asset, assets[0]._id);
    assert.equal(opened.dates.find((row) => row.date === night).overrides.image.asset, assets[0]._id);
  });

});

describe("events: gallery", () => {
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

  /** The series gallery on the live site: [key, date] pairs, as shown. */
  const liveGallery = () =>
    (world.sanity.published("eventSeries")[0]?.gallery || []).map((image) => [image._key, image.date || ""]);

  it("a photo goes straight to Sanity, and ops shows it from there", async () => {
    const photo = await ops.addGalleryPhoto(event, { name: "bar.jpg" });
    assert.ok(world.sanity.view("raw").some((doc) => doc._id === photo.asset), "in Sanity before any staging");
    assert.match(photo.url, /^https:\/\/cdn\.sanity\.io\/images\//);
    assert.deepEqual((await ops.open(event)).gallery.map((item) => item.key), [photo.key]);
  });

  it("series and night photos: newest first, the night's marked with its date, live on Update website", async () => {
    const night = liveNights(world)[1];
    const series = await ops.addGalleryPhoto(event, { name: "bar.jpg" });
    const ofNight = await ops.addGalleryPhoto(event, { date: night, name: "crowd.jpg" });
    await ops.waitUntilReady(event);
    assert.deepEqual(liveGallery(), [], "the website waits for Update website");
    assert.equal(await ops.sees(event), "Changed");

    await ops.updateWebsite(event);
    assert.deepEqual(liveGallery(), [
      [ofNight.key, night],
      [series.key, ""],
    ]);
    assert.equal(await ops.sees(event), "Live");
  });

  it("removing a photo takes it off on Update website", async () => {
    const photo = await ops.addGalleryPhoto(event, { name: "gone.jpg" });
    const kept = await ops.addGalleryPhoto(event, { name: "kept.jpg" });
    await ops.waitUntilReady(event);
    await ops.updateWebsite(event);
    await ops.removeGalleryPhoto(event, photo);
    await ops.waitUntilReady(event);
    assert.equal(await ops.sees(event), "Changed");
    await ops.updateWebsite(event);
    assert.deepEqual(liveGallery(), [[kept.key, ""]]);
  });

  it("many photos at once: all live after one Update website", async () => {
    for (let n = 0; n < 12; n += 1) await ops.addGalleryPhoto(event, { name: `photo-${n}.jpg` });
    await ops.waitUntilReady(event);
    await ops.updateWebsite(event);
    assert.equal(liveGallery().length, 12);
  });

  it("the same photo twice is in the gallery once", async () => {
    await ops.addGalleryPhoto(event, { name: "a.jpg" });
    await ops.addGalleryPhoto(event, { name: "a.jpg" });
    assert.equal((await ops.open(event)).gallery.length, 1);
  });

  it("refuses a night date that isn't a date", async () => {
    await ops.addGalleryPhoto(event, { date: "soon", status: 400 });
  });
});

describe("events: the Drive copy for collaborators", () => {
  let world;
  let ops;
  let event;
  beforeEach(async () => {
    world = await createFakeWorld();
    world.install();
    ops = editor(world);
    event = await ops.create(weeklySeries());
  });
  afterEach(() => world.restore());

  /** The event's "website images" folder, and what's in it (not binned). */
  async function websiteImages() {
    const { driveFolderId } = await ops.open(event);
    const folder = [...world.google.driveFiles.values()].find(
      (file) => file.name === "website images" && file.parents.includes(driveFolderId) && !file.trashed,
    );
    const files = folder
      ? [...world.google.driveFiles.values()].filter((file) => file.parents.includes(folder.id) && !file.trashed)
      : [];
    return { folder, files };
  }
  const tags = (files) => files.map((file) => file.appProperties?.opsImage || "").sort();

  it("copies the main image, a night's flyer and gallery photos, once", async () => {
    const night = (await ops.open(event)).dates[1].date;
    await ops.uploadImage(event, { name: "hero.jpg" });
    await ops.uploadImage(event, { name: "guest.jpg", date: night, bytes: 3000 });
    const photo = await ops.addGalleryPhoto(event, { name: "crowd.jpg", date: night });
    const opened = await ops.open(event);

    const first = await ops.copyToDrive();
    assert.equal(first.copied, 3);
    const { files } = await websiteImages();
    assert.deepEqual(tags(files), [
      `flyer:${night}:${opened.dates.find((row) => row.date === night).overrides.image.asset}`,
      `gallery:${night}:${photo.asset}`,
      `hero::${opened.mainImage.asset}`,
    ]);
    assert.ok(files.some((file) => file.name.startsWith("hero - ")), "named for people, not ids");

    const again = await ops.copyToDrive();
    assert.equal(again.behind, 0, "nothing to do when nothing changed");
  });

  it("a photo taken off in ops goes to the Drive bin", async () => {
    const gone = await ops.addGalleryPhoto(event, { name: "gone.jpg" });
    await ops.addGalleryPhoto(event, { name: "kept.jpg" });
    await ops.copyToDrive();
    await ops.removeGalleryPhoto(event, gone);
    const run = await ops.copyToDrive();
    assert.equal(run.binned, 1);
    const { files } = await websiteImages();
    assert.equal(files.length, 1);
    assert.ok(!tags(files).some((tag) => tag.endsWith(gone.asset)));
  });

  it("leaves files people put in the folder by hand", async () => {
    await ops.addGalleryPhoto(event, { name: "a.jpg" });
    await ops.copyToDrive();
    const { folder } = await websiteImages();
    world.google.driveFiles.set("by-hand", { id: "by-hand", name: "poster.png", mimeType: "image/png", parents: [folder.id] });
    await ops.addGalleryPhoto(event, { name: "b.jpg" });
    await ops.copyToDrive();
    assert.ok(!world.google.driveFiles.get("by-hand").trashed);
  });

  it("a gallery photo that came from Drive moves in, rather than being copied again", async () => {
    // As the backfill leaves it: the original in the old gallery folder, the photo in ops.
    const { driveFolderId } = await ops.open(event);
    world.google.driveFiles.set("old-gallery", { id: "old-gallery", name: "gallery", mimeType: "application/vnd.google-apps.folder", parents: [driveFolderId] });
    world.google.driveFiles.set("original", { id: "original", name: "IMG_1.jpg", mimeType: "image/jpeg", parents: ["old-gallery"] });
    const asset = "image-0a1b2c3d4e5f60718293a4b5c6d7e8f901234567-800x600-jpg";
    world.baserow.update("Events", event.id, {
      Gallery: JSON.stringify([{ key: "original", asset, date: "", added: "", source: "drive:original" }]),
    });
    const run = await ops.copyToDrive();
    assert.equal(run.copied, 1);
    const { folder, files } = await websiteImages();
    assert.deepEqual(files.map((file) => file.id), ["original"], "the original, no second copy");
    assert.deepEqual(world.google.driveFiles.get("original").parents, [folder.id]);
    assert.deepEqual(tags(files), [`gallery::${asset}`]);
  });

  it("a row pointing at another environment's folder gets one of its own, then its copies", async () => {
    // The dev clone copies rows from production, Drive folder id included.
    world.google.driveFiles.set("other-series", { id: "other-series", name: "Series", mimeType: "application/vnd.google-apps.folder", parents: ["other-root"] });
    world.baserow.update("Events", event.id, { "Drive folder id": "other-series" });
    await ops.addGalleryPhoto(event, { name: "mine.jpg" });
    await ops.copyToDrive();
    const { driveFolderId } = await ops.open(event);
    assert.notEqual(driveFolderId, "other-series");
    assert.ok(world.google.eventFolders().some((folder) => folder.id === driveFolderId), "under this environment's root");
    await ops.copyToDrive();
    assert.equal((await websiteImages()).files.length, 1);
    assert.ok(![...world.google.driveFiles.values()].some((file) => file.parents.includes("other-series")), "nothing in theirs");
  });

  it("more photos than one run copies: they all get there", async () => {
    for (let n = 0; n < 24; n += 1) await ops.addGalleryPhoto(event, { name: `photo-${n}.jpg` });
    const runs = [];
    for (let n = 0; n < 5; n += 1) {
      const run = await ops.copyToDrive();
      runs.push(run.copied);
      if (!run.behind) break;
    }
    assert.ok(runs[0] < 24, "more than one run");
    assert.equal((await websiteImages()).files.length, 24);
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

  it("an entry deleted by hand in Google Calendar comes back with Sync calendar", async () => {
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
