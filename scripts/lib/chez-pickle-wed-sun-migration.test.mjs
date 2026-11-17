/**
 * migrations/2026-11-17-chez-pickle-wed-sun.mjs, run as a deploy runs it
 * against a D1 with the real schema, with Sanity, Google Calendar and Drive
 * faked: for real (its nights and their changes kept, its menu, the
 * website), again (nothing left to do), with the schedule or menu changed by
 * the owner, not found, and as a dry run.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { d1EventRepository } from "../../ops/site/src/events/server/adapters/d1-events.js";
import { d1MenuRepository } from "../../ops/site/src/menu/server/adapters/d1-menu.js";
import {
  createEvent,
  getEvent,
  setEventImage,
  updateOccurrenceContent,
} from "../../ops/site/src/events/server/event-store.js";
import { runWebsiteJob } from "../../ops/site/src/events/server/website-jobs.js";
import { createMenu, listMenus } from "../../ops/site/src/menu/server/menus.js";
import { createFakeWorld } from "../../ops/site/src/testing/fake-world.js";
import { createTestD1 } from "../../shared/testing/d1-sqlite.js";
import * as wedSun from "../../migrations/2026-11-17-chez-pickle-wed-sun.mjs";

const { SLUG, STARTS_ON, WEEKDAYS } = wedSun;
const THURSDAYS = ["2026-11-12", "2026-11-19", "2026-11-26"];
/** Every night through December, as the owner wants it. */
const THROUGH_DECEMBER = [
  "2026-11-12", "2026-11-19",
  "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29",
  "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06",
  "2026-12-09", "2026-12-10", "2026-12-11", "2026-12-12", "2026-12-13",
  "2026-12-16", "2026-12-17", "2026-12-18", "2026-12-19", "2026-12-20",
  "2026-12-23", "2026-12-24", "2026-12-25", "2026-12-26", "2026-12-27",
  "2026-12-30", "2026-12-31",
];

describe("2026-11-17-chez-pickle-wed-sun", () => {
  let world;
  beforeEach(async () => {
    // The day the owner asked: Tuesday the 17th, between the 2nd and 3rd Thursdays.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-17T12:00:00Z") });
    world = await createFakeWorld();
    world.install();
  });
  afterEach(() => {
    world.restore();
    vi.useRealTimers();
  });

  const opsEnv = (db) => ({ ...world.env, eventRepository: d1EventRepository(db), menuRepository: d1MenuRepository(db) });

  async function untilReady(env, id) {
    for (let step = 0; step < 60; step += 1) {
      const result = await runWebsiteJob(env, { eventId: id });
      assert.equal(result.failed || "", "", `website job failed: ${result.failed}`);
      if (result.done) return;
    }
    throw new Error("the website job never finished");
  }

  /**
   * Chez Pickle as dev and production have it: Thursdays from the 12th to the
   * 26th, live, two nights changed by hand, and its Food menu on Thursdays.
   */
  async function seed(db, { series = {}, menu = {} } = {}) {
    const env = opsEnv(db);
    const created = await createEvent(env, {
      name: "Chez Pickle",
      category: "popup",
      description: "Smash burgers from Chez Pickle, in the kitchen at Gwenda.",
      startsOn: "2026-11-12",
      startTime: "17:00",
      endTime: "22:00",
      repeatUnit: "week",
      repeatEvery: 1,
      weekdays: ["thu"],
      endsOn: "2026-11-26",
      ...series,
    });
    await setEventImage(env, created.id, { bytes: new TextEncoder().encode("burger"), filename: "picture.png", contentType: "image/png" });
    if (created.dates.some((night) => night.date === "2026-11-19")) {
      await updateOccurrenceContent(env, created.id, "2026-11-19", { endTime: "23:00", operationsNotes: "Sold out by nine" });
    }
    if (created.dates.some((night) => night.date === "2026-11-26")) {
      await updateOccurrenceContent(env, created.id, "2026-11-26", { description: "Thanksgiving special." });
    }
    await untilReady(env, created.id);
    const food = await createMenu(env, {
      name: "Chez Pickle",
      kind: "kitchen",
      popupSeriesId: created.id,
      startsOn: "2026-11-12",
      endsOn: "2026-11-26",
      days: "thu",
      ...menu,
    });
    return { event: await getEvent(env, created.id), menu: food, env };
  }

  async function run(db, { dryRun = false } = {}) {
    const lines = [];
    const result = await wedSun.up({ env: "dev", d1: () => db, processEnv: world.env, dryRun, log: (line) => lines.push(line) });
    return { lines, text: lines.join("\n"), result };
  }

  const dump = async (db) =>
    JSON.stringify([await d1EventRepository(db).exportAll(), await d1MenuRepository(db).list("menus")]);
  const outside = () =>
    JSON.stringify([
      world.sanity.view("raw").map(({ _rev, _updatedAt, _createdAt, ...doc }) => doc).sort((a, b) => a._id.localeCompare(b._id)),
      world.google.calendar().map((entry) => entry.id).sort(),
    ]);
  const writes = () => world.calls.filter((call) => !call.startsWith("GET ") && !call.includes("oauth2")).length;
  const nightsOf = (view) =>
    world.sanity
      .view(view)
      .filter((doc) => doc._type === "event" && doc.seriesId === SLUG)
      .map((doc) => doc.date)
      .sort();
  const menuOf = async (env, id) => (await listMenus(env)).menus.find((menu) => menu.id === String(id));

  it("makes it Wednesday to Sunday from the 25th with no end, keeps the earlier nights and their changes, moves its menu, puts it on the website; then nothing to do", async () => {
    const db = createTestD1("ops");
    const { event, menu, env } = await seed(db);
    assert.deepEqual(event.dates.map((night) => night.date), THURSDAYS, "Thursdays to begin with");

    const { text, result } = await run(db);

    const now = await getEvent(env, event.id);
    assert.deepEqual(
      [now.repeatUnit, Number(now.repeatEvery), now.weekdays, now.startsOn, now.endsOn, now.extraDates],
      ["week", 1, WEEKDAYS, STARTS_ON, "", ["2026-11-12", "2026-11-19"]],
    );
    assert.deepEqual(wedSun.nightsThrough(now), THROUGH_DECEMBER, "its nights through December");
    assert.equal(now.dates.at(-1).date, "2027-02-07", "a rolling run: 12 weeks ahead");
    for (const date of THURSDAYS) {
      const before = event.dates.find((night) => night.date === date);
      const after = now.dates.find((night) => night.date === date);
      assert.equal(after.id, before.id, `${date} is the same night`);
      assert.equal(after.slug, before.slug, `${date} keeps its web address`);
      assert.deepEqual(after.overrides, before.overrides, `${date} keeps what was changed on it`);
    }
    assert.equal(now.dates.find((night) => night.date === "2026-11-19").overrides.endTime, "23:00");
    assert.equal(now.dates.find((night) => night.date === "2026-11-26").overrides.description, "Thanksgiving special.");
    for (const key of ["name", "slug", "description", "startTime", "endTime", "category"]) {
      assert.equal(now[key], event[key], `its ${key} stays`);
    }

    const food = await menuOf(env, menu.id);
    assert.deepEqual([food.startsOn, food.endsOn, food.days], ["2026-11-12", "", WEEKDAYS], "the menu: Wed–Sun from the 12th, ongoing");

    assert.equal(now.publish.live, "current", "on the website");
    const upcoming = THROUGH_DECEMBER.filter((date) => date >= "2026-11-17");
    for (const view of ["published", "previewDrafts"]) {
      const shown = nightsOf(view);
      for (const date of upcoming) assert.ok(shown.includes(date), `${view}: ${date} is on the website`);
    }
    assert.deepEqual(result, { schedule: "changed", menu: "changed", published: true });
    assert.match(text, /is now every Wednesday and Thursday and Friday and Saturday and Sunday from 2026-11-25, no end date, with 2 nights added by hand \(2026-11-12, 2026-11-19\); it was every Thursday from 2026-11-12 to 2026-11-26/);
    assert.match(text, new RegExp(`its nights through 2026-12-31 \\(29\\): ${THROUGH_DECEMBER.join(", ")}`));
    assert.match(text, /kept as they were, with anything changed on them: 2026-11-12, 2026-11-19, 2026-11-26/);
    assert.doesNotMatch(text, /dropped:/);
    assert.match(text, /the menu "Chez Pickle" \(menu \d+\) runs from 12 Nov, Wed–Sun; it ran 12–26 Nov, Thu/);

    const before = [await dump(db), outside()];
    const calls = writes();
    const again = await run(db);
    assert.deepEqual([await dump(db), outside()], before, "a second run changes nothing");
    assert.equal(writes(), calls, "and writes nothing anywhere");
    assert.deepEqual(again.lines, [
      `Nothing to do: "Chez Pickle" (event ${event.id}) is every Wednesday and Thursday and Friday and Saturday and Sunday from 2026-11-25, no end date, with 2 nights added by hand (2026-11-12, 2026-11-19), its menu too, and the website is in step.`,
    ]);
  });

  it("leaves a schedule the owner has changed since, and says so; a Thursdays menu still moves", async () => {
    const db = createTestD1("ops");
    const { event, menu, env } = await seed(db, { series: { repeatUnit: "day", endsOn: "2026-12-20" } });

    const { text, result } = await run(db);

    const after = await getEvent(env, event.id);
    for (const key of ["repeatUnit", "weekdays", "startsOn", "endsOn", "extraDates"]) assert.deepEqual(after[key], event[key], key);
    assert.deepEqual(after.dates.map((night) => night.id), event.dates.map((night) => night.id), "the same nights");
    assert.match(text, /left alone: the schedule of "Chez Pickle" \(event \d+\) is every day from 2026-11-12 to 2026-12-20, not the Thursdays run it was/);
    assert.equal(result.schedule, "owner's");
    assert.deepEqual((await menuOf(env, menu.id)).days, WEEKDAYS);
  });

  it("leaves a menu the owner has changed since, and says so", async () => {
    const db = createTestD1("ops");
    const { menu, env } = await seed(db, { menu: { days: "fri,sat" } });

    const { text, result } = await run(db);

    const after = await menuOf(env, menu.id);
    assert.deepEqual([after.startsOn, after.endsOn, after.days], ["2026-11-12", "2026-11-26", ["fri", "sat"]]);
    assert.match(text, /left alone: the menu "Chez Pickle" \(menu \d+\) runs 12–26 Nov, Fri & Sat, not on Thursdays as it did/);
    assert.equal(result.schedule, "changed");
    assert.equal(result.menu, "owner's");
  });

  it("stops with a clear message when there is no Chez Pickle, and changes nothing", async () => {
    const db = createTestD1("ops");
    await createEvent(opsEnv(db), { name: "Jazz Night", description: "Jazz.", startsOn: "2026-11-19", startTime: "19:00", repeatUnit: "once" });
    const before = [await dump(db), outside()];
    await assert.rejects(run(db), /Chez Pickle was not found: no event at \/whats-on\/chez-pickle/);
    assert.deepEqual([await dump(db), outside()], before);
  });

  it("a dry run changes nothing in ops, on the website or the calendar, and says what it would do", async () => {
    const db = createTestD1("ops");
    const { event } = await seed(db);
    const before = [await dump(db), outside()];
    const calls = writes();

    const { text } = await run(db, { dryRun: true });

    assert.deepEqual([await dump(db), outside()], before);
    assert.equal(writes(), calls, "nothing sent that writes");
    assert.match(text, /^Dry run: working on a copy of the data/);
    assert.match(text, new RegExp(`would change events ${event.id} "Chez Pickle": startsOn "2026-11-12" → "2026-11-25", weekdays \\["thu"\\] → \\["wed","thu","fri","sat","sun"\\], endsOn "2026-11-26" → nothing, extraDates \\[\\] → \\["2026-11-12","2026-11-19"\\]`));
    assert.match(text, /would change menus \d+ "Chez Pickle": endsOn "2026-11-26" → nothing, days "thu" → "wed,thu,fri,sat,sun"/);
    assert.match(text, new RegExp(`its nights through 2026-12-31 \\(29\\): ${THROUGH_DECEMBER.join(", ")}`));
    assert.match(text, /the menu "Chez Pickle" \(menu \d+\) would run from 12 Nov, Wed–Sun/);
    assert.match(text, /would put it on the website \(\/whats-on\/chez-pickle\)/);
  });
});
