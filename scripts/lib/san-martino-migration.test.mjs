/**
 * migrations/2026-11-11-san-martino-one-night.mjs, run as a deploy runs it
 * against a D1 with the real schema, with Sanity, Google Calendar and Drive
 * faked: for real, again (nothing left to do), halfway, left alone, and as a
 * dry run.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { d1EventRepository } from "../../ops/site/src/events/server/adapters/d1-events.js";
import { d1MenuRepository } from "../../ops/site/src/menu/server/adapters/d1-menu.js";
import { createEvent, getEvent, listEvents, setEventImage, updateEvent } from "../../ops/site/src/events/server/event-store.js";
import { runWebsiteJob } from "../../ops/site/src/events/server/website-jobs.js";
import { createFakeWorld } from "../../ops/site/src/testing/fake-world.js";
import { createTestD1 } from "../../shared/testing/d1-sqlite.js";
import * as sanMartino from "../../migrations/2026-11-11-san-martino-one-night.mjs";

const { SLUG, DATE } = sanMartino;
const NAME = "SAN MARTINO IN GWENDA";
const WORDS = "In Italy, we say “A San Martino ogni mosto diventa vino”: by St Martin’s Day, the grape must becomes wine.";
/** The Wednesdays after the 11th that the weekly series has, 12 weeks ahead of 11 November. */
const LATER = [
  "2026-11-18", "2026-11-25", "2026-12-02", "2026-12-09", "2026-12-16", "2026-12-23",
  "2026-12-30", "2027-01-06", "2027-01-13", "2027-01-20", "2027-01-27", "2027-02-03",
];

describe("2026-11-11-san-martino-one-night", () => {
  let world;
  beforeEach(async () => {
    // St Martin's Day, the day the owner asked: the night is tonight.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-11T12:00:00Z") });
    world = await createFakeWorld();
    world.install();
  });
  afterEach(() => {
    world.restore();
    vi.useRealTimers();
  });

  /** Ops as the migration reaches it: the events in `db`, with Sanity, Google Calendar and Drive faked. */
  const opsEnv = (db) => ({ ...world.env, eventRepository: d1EventRepository(db), menuRepository: d1MenuRepository(db) });

  async function untilReady(env, id) {
    for (let step = 0; step < 60; step += 1) {
      const result = await runWebsiteJob(env, { eventId: id });
      assert.equal(result.failed || "", "", `website job failed: ${result.failed}`);
      if (result.done) return;
    }
    throw new Error("the website job never finished");
  }

  /** An event as ops makes it, with its flyer, on the website. */
  async function add(db, fields) {
    const env = opsEnv(db);
    const event = await createEvent(env, { repeatEvery: 1, ...fields });
    await setEventImage(env, event.id, { bytes: new TextEncoder().encode(fields.name), filename: "flyer.jpg", contentType: "image/jpeg" });
    await untilReady(env, event.id);
    return getEvent(env, event.id);
  }

  /** San Martino as dev has it (a weekly Wednesday series from the 11th, live), and a night that is not it. */
  async function seed(db, { series = {} } = {}) {
    const event = await add(db, {
      name: NAME,
      description: WORDS,
      offer: "£5 glass wine",
      pageUrl: "https://www.instagram.com/p/DfXVPgXDg65/",
      startsOn: DATE,
      startTime: "19:15",
      endTime: "22:00",
      repeatUnit: "week",
      weekdays: ["wed"],
      ...series,
    });
    const jazz = await add(db, { name: "Jazz Night", description: "Jazz.", startsOn: "2026-11-26", startTime: "19:00", repeatUnit: "once" });
    return { event, jazz, env: opsEnv(db) };
  }

  async function run(db, { dryRun = false } = {}) {
    const lines = [];
    await sanMartino.up({ env: "dev", d1: () => db, processEnv: world.env, dryRun, log: (line) => lines.push(line) });
    return lines;
  }

  const dump = async (db) => JSON.stringify(await d1EventRepository(db).exportAll());
  /** Everything outside D1 that a run could change: the website's documents, the calendar, Drive. */
  const outside = () =>
    JSON.stringify([
      world.sanity.view("raw").map(({ _rev, _updatedAt, _createdAt, ...doc }) => doc).sort((a, b) => a._id.localeCompare(b._id)),
      world.google.calendar().map((entry) => entry.id).sort(),
      [...world.google.driveFiles.values()].map((file) => [file.id, Boolean(file.trashed)]),
    ]);
  const docsOf = (slug, view = "raw") =>
    world.sanity.view(view).filter((doc) => doc.seriesId === slug || doc._id.replace(/^drafts\./, "") === `series-${slug}`);
  const nightDates = (slug, view) =>
    docsOf(slug, view).filter((doc) => doc._type === "event").map((doc) => doc.date).sort();
  const writes = () => world.calls.filter((call) => !call.startsWith("GET ") && !call.includes("oauth2")).length;
  const calendarId = (night) => String(night.googleCalendarEventId || "").split("|")[0];
  const inCalendar = (night) => world.google.calendarEvents.has(calendarId(night));

  /** The one-off San Martino as the owner wants it: tonight only, everywhere. */
  async function assertOneNight(env, before) {
    const one = await getEvent(env, before.id);
    assert.equal(one.repeatUnit, "once", "a one-off event, not a series");
    assert.equal(one.startsOn, DATE);
    assert.deepEqual(one.dates.map((night) => night.date), [DATE], "only tonight is left in ops");
    assert.equal(one.dates[0].id, before.dates[0].id, "tonight is the same night as before");
    for (const key of ["name", "slug", "description", "offer", "pageUrl", "startTime", "endTime", "category", "driveFolderId"]) {
      assert.equal(one[key], before[key], `its ${key} stays`);
    }
    assert.equal(one.mainImage?.asset, before.mainImage.asset, "its flyer stays");
    assert.equal(one.publish.live, "current");

    for (const view of ["published", "previewDrafts"]) {
      const series = docsOf(SLUG, view).filter((doc) => doc._type === "eventSeries");
      assert.equal(series.length, 1, view);
      assert.equal(series[0].schedule, "once", `${view}: the website shows it as a one-off`);
      assert.deepEqual(nightDates(SLUG, view), [DATE], `${view}: tonight's page only`);
      const [night] = docsOf(SLUG, view).filter((doc) => doc._type === "event");
      assert.deepEqual([night.title, night.ticketStart, night.ticketEnd, night.removed === true], [NAME, "19:15", "22:00", false], view);
    }
    assert.deepEqual(nightDates(SLUG, "raw"), [DATE], "no page or draft of a later Wednesday is left on the website");
    assert.ok(inCalendar(one.dates[0]), "tonight stays in the calendar");
    assert.deepEqual(before.dates.filter((night) => night.date !== DATE).filter(inCalendar), [], "the later Wednesdays are gone from the calendar");
    return one;
  }

  it("makes it a one-off tonight; the later Wednesdays go from ops, the website and the calendar; then nothing to do", async () => {
    const db = createTestD1("ops");
    const { event, jazz, env } = await seed(db);
    assert.deepEqual(event.dates.map((night) => night.date), [DATE, ...LATER], "every Wednesday to begin with");
    assert.deepEqual(nightDates(SLUG, "published"), [DATE, ...LATER], "each with its page on the website");
    assert.ok(event.dates.every(inCalendar), "and in the calendar");
    const jazzBefore = JSON.stringify([await getEvent(env, jazz.id), docsOf(jazz.slug)]);

    const lines = await run(db);

    await assertOneNight(env, event);
    assert.equal(JSON.stringify([await getEvent(env, jazz.id), docsOf(jazz.slug)]), jazzBefore, "Jazz Night is untouched");
    const text = lines.join("\n");
    assert.match(text, new RegExp(`"${NAME}" \\(event ${event.id}\\) is now a one-off event on Wednesday ${DATE}, 19:15 to 22:00; it was weekly on Wednesdays from ${DATE}`));
    assert.match(text, /12 later Wednesdays, 2026-11-18 to 2027-02-03: 12 nights in ops, 12 pages on the website, 12 calendar entries/);
    assert.match(text, new RegExp(`on the website as a one-off: /whats-on/${SLUG}, Wednesday ${DATE} only; the 12 later Wednesdays are gone from ops, the website and the calendar`));

    const before = [await dump(db), outside()];
    const calls = writes();
    const again = await run(db);
    assert.deepEqual([await dump(db), outside()], before, "a second run changes nothing");
    assert.equal(writes(), calls, "and writes nothing anywhere");
    assert.deepEqual(again, [`Nothing to do: "${NAME}" (event ${event.id}) is a one-off event on Wednesday ${DATE}, and nothing of a later Wednesday is left.`]);
  });

  it("finishes a run that stopped after the save: the later Wednesdays still leave the website", async () => {
    const db = createTestD1("ops");
    const { event, env } = await seed(db);
    const { changed } = await sanMartino.makeOneOff(env);
    assert.equal(changed, true);
    assert.deepEqual(nightDates(SLUG, "published"), [DATE, ...LATER], "the later Wednesdays are still on the website");

    const lines = await run(db);

    await assertOneNight(env, event);
    assert.match(lines.join("\n"), /the 12 later Wednesdays are gone from ops, the website and the calendar/);
  });

  it("still takes the later Wednesdays off when it runs after the night (a later deploy)", async () => {
    const db = createTestD1("ops");
    const { event, env } = await seed(db);
    vi.setSystemTime(new Date("2026-11-13T09:00:00Z"));

    const lines = await run(db);

    const one = await getEvent(env, event.id);
    assert.equal(one.repeatUnit, "once");
    assert.deepEqual(one.dates.map((night) => night.date), [DATE], "the 11th stays in ops, as a past night");
    assert.equal(one.dates[0].id, event.dates[0].id);
    for (const view of ["published", "previewDrafts"]) {
      assert.equal(docsOf(SLUG, view).find((doc) => doc._type === "eventSeries")?.schedule, "once", view);
      assert.deepEqual(nightDates(SLUG, view), [DATE], view);
    }
    assert.deepEqual(nightDates(SLUG, "raw"), [DATE]);
    assert.deepEqual(event.dates.filter((night) => night.date !== DATE).filter(inCalendar), []);
    assert.match(lines.join("\n"), /the 12 later Wednesdays are gone from ops, the website and the calendar/);

    const again = await run(db);
    assert.deepEqual(again, [`Nothing to do: "${NAME}" (event ${event.id}) is a one-off event on Wednesday ${DATE}, and nothing of a later Wednesday is left.`]);
  });

  for (const [what, series, now] of [
    ["weekly on Thursdays", { weekdays: ["thu"], startsOn: "2026-11-12" }, "weekly on Thursdays from 2026-11-12"],
    ["given an end date", { endsOn: "2026-12-16" }, `weekly on Wednesdays from ${DATE} to 2026-12-16`],
    ["every other week", { repeatEvery: 2 }, `every 2 weeks on Wednesdays from ${DATE}`],
  ]) {
    it(`leaves it alone when the owner has changed the series (${what}), and says why`, async () => {
      const db = createTestD1("ops");
      const { event } = await seed(db, { series });
      const before = [await dump(db), outside()];
      const lines = await run(db);
      assert.deepEqual([await dump(db), outside()], before);
      assert.deepEqual(lines, [
        `left alone: "${NAME}" (event ${event.id}) is no longer the weekly Wednesday series from ${DATE}: it is ${now}; nothing was changed`,
      ]);
    });
  }

  it("leaves a one-off on another date alone", async () => {
    const db = createTestD1("ops");
    const { event, env } = await seed(db);
    await updateEvent(env, event.id, { repeatUnit: "once", weekdays: [], startsOn: "2026-11-18" });
    await untilReady(env, event.id);
    const before = [await dump(db), outside()];
    const lines = await run(db);
    assert.deepEqual([await dump(db), outside()], before);
    assert.deepEqual(lines, [
      `left alone: "${NAME}" (event ${event.id}) is no longer the weekly Wednesday series from ${DATE}: it is a one-off event on 2026-11-18; nothing was changed`,
    ]);
  });

  it("says when there is no San Martino", async () => {
    const db = createTestD1("ops");
    await add(db, { name: "Jazz Night", description: "Jazz.", startsOn: "2026-11-26", startTime: "19:00", repeatUnit: "once" });
    const before = [await dump(db), outside()];
    const lines = await run(db);
    assert.deepEqual([await dump(db), outside()], before);
    assert.deepEqual(lines, [`not found: no event at /whats-on/${SLUG}; nothing to do`]);
    assert.deepEqual(await listEvents(opsEnv(db)).then((events) => events.map((e) => e.name)), ["Jazz Night"]);
  });

  it("a dry run changes nothing in ops, on the website, the calendar or Drive, and says what it would do", async () => {
    const db = createTestD1("ops");
    const { event } = await seed(db);
    const before = [await dump(db), outside()];
    const calls = writes();
    const lines = await run(db, { dryRun: true });
    assert.deepEqual([await dump(db), outside()], before);
    assert.equal(writes(), calls, "nothing sent that writes");
    const text = lines.join("\n");
    assert.match(text, /^Dry run: working on a copy of the data/);
    assert.match(text, new RegExp(`would change events ${event.id} "${NAME}": repeatUnit "week" → "once"`));
    assert.match(text, new RegExp(`"${NAME}" \\(event ${event.id}\\) would be a one-off event on Wednesday ${DATE}, 19:15 to 22:00; it was weekly on Wednesdays from ${DATE}`));
    assert.match(text, /would drop 12 later Wednesdays, 2026-11-18 to 2027-02-03: 12 nights in ops, 12 pages on the website, 12 calendar entries/);
    assert.match(text, new RegExp(`would put it on the website as a one-off \\(/whats-on/${SLUG}\\) and take the 12 later Wednesdays off the website and the calendar`));
  });
});
