/**
 * migrations/2026-11-11-chez-pickle-thursdays.mjs, run as a deploy runs it
 * against a D1 with the real schema, with Sanity, Google Calendar and Drive
 * faked: for real, again (nothing left to do), with photos already in the
 * gallery, with the schedule already done or changed by the owner, not
 * found, and as a dry run.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { parseImageAssetId } from "../../shared/sanity-image.js";
import { d1EventRepository } from "../../ops/site/src/events/server/adapters/d1-events.js";
import { d1MenuRepository } from "../../ops/site/src/menu/server/adapters/d1-menu.js";
import {
  addGalleryImage,
  createEvent,
  getEvent,
  setEventImage,
  updateEvent,
} from "../../ops/site/src/events/server/event-store.js";
import { runWebsiteJob } from "../../ops/site/src/events/server/website-jobs.js";
import { createFakeWorld } from "../../ops/site/src/testing/fake-world.js";
import { createTestD1 } from "../../shared/testing/d1-sqlite.js";
import * as chezPickle from "../../migrations/2026-11-11-chez-pickle-thursdays.mjs";

const { SLUG, LAST } = chezPickle;
const FIRST = "2026-11-12";
const THURSDAYS = ["2026-11-12", "2026-11-19", "2026-11-26"];
const GUEST = "KITCHEN POP UP";
const WORDS = "Smash burgers from Chez Pickle, in the kitchen at Gwenda.";
const PHOTOS = new URL("../../migrations/assets/2026-11-11-chez-pickle/", import.meta.url);
const sha1 = (bytes) => createHash("sha1").update(bytes).digest("hex");

/** The burger photos, as the migration finds them: JPEGs in name order. */
async function photoFiles() {
  const names = (await readdir(PHOTOS)).filter((name) => /\.jpe?g$/i.test(name)).sort();
  return Promise.all(
    names.map(async (name) => {
      const bytes = await readFile(new URL(name, PHOTOS));
      return { name, bytes, sha1: sha1(bytes) };
    }),
  );
}

describe("2026-11-11-chez-pickle-thursdays", () => {
  let world;
  let photos;
  beforeEach(async () => {
    // The day the owner asked: Wednesday, the night before the first Thursday.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-11T12:00:00Z") });
    world = await createFakeWorld();
    world.install();
    photos = await photoFiles();
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

  /** An event as ops makes it, with its picture, on the website. */
  async function add(db, fields, picture = new TextEncoder().encode(fields.name)) {
    const env = opsEnv(db);
    const event = await createEvent(env, { repeatEvery: 1, ...fields });
    await setEventImage(env, event.id, { bytes: picture, filename: "picture.png", contentType: "image/png" });
    await untilReady(env, event.id);
    return getEvent(env, event.id);
  }

  /** Chez Pickle as dev and production have it (a one-off on Thursday the 12th, live), and a night that is not it. */
  async function seed(db, { series = {}, picture } = {}) {
    const event = await add(
      db,
      {
        name: "Chez Pickle",
        category: "popup",
        artist: GUEST,
        description: WORDS,
        shortDescription: "Burgers in the kitchen",
        pageUrl: "https://www.instagram.com/chezpickle/",
        startsOn: FIRST,
        startTime: "17:00",
        endTime: "22:00",
        repeatUnit: "once",
        ...series,
      },
      picture,
    );
    const jazz = await add(db, { name: "Jazz Night", description: "Jazz.", startsOn: "2026-11-19", startTime: "19:00", repeatUnit: "once" });
    return { event, jazz, env: opsEnv(db) };
  }

  async function run(db, { dryRun = false } = {}) {
    const lines = [];
    await chezPickle.up({ env: "dev", d1: () => db, processEnv: world.env, dryRun, log: (line) => lines.push(line) });
    return lines;
  }

  const dump = async (db) => JSON.stringify(await d1EventRepository(db).exportAll());
  const outside = () =>
    JSON.stringify([
      world.sanity.view("raw").map(({ _rev, _updatedAt, _createdAt, ...doc }) => doc).sort((a, b) => a._id.localeCompare(b._id)),
      world.google.calendar().map((entry) => entry.id).sort(),
      [...world.google.driveFiles.values()].map((file) => [file.id, Boolean(file.trashed)]),
    ]);
  const docsOf = (slug, view) =>
    world.sanity.view(view).filter((doc) => doc.seriesId === slug || doc._id.replace(/^drafts\./, "") === `series-${slug}`);
  const nightsOf = (slug, view) => docsOf(slug, view).filter((doc) => doc._type === "event").sort((a, b) => a.date.localeCompare(b.date));
  const seriesOf = (slug, view) => docsOf(slug, view).find((doc) => doc._type === "eventSeries");
  const writes = () => world.calls.filter((call) => !call.startsWith("GET ") && !call.includes("oauth2")).length;
  const hashOf = (asset) => parseImageAssetId(asset)?.sha1;
  const galleryHashes = (event) => event.gallery.map((photo) => hashOf(photo.asset));

  /** Chez Pickle as the owner wants it: Thursdays to the 26th, no guest, the photos, everywhere. */
  async function assertThursdays(env, before, gallery) {
    const now = await getEvent(env, before.id);
    assert.deepEqual(
      [now.repeatUnit, Number(now.repeatEvery), now.weekdays, now.startsOn, now.endsOn],
      ["week", 1, ["thu"], FIRST, LAST],
      "weekly on Thursdays from the 12th to the 26th",
    );
    assert.deepEqual(now.dates.map((night) => night.date), THURSDAYS);
    assert.equal(now.dates[0].id, before.dates[0].id, "the 12th is the same night as before");
    assert.equal(now.artist, "", "no guest");
    for (const key of ["name", "slug", "description", "shortDescription", "offer", "pageUrl", "startTime", "endTime", "category", "driveFolderId"]) {
      assert.equal(now[key], before[key], `its ${key} stays`);
    }
    assert.equal(now.mainImage?.asset, before.mainImage.asset, "its picture stays");
    assert.deepEqual(galleryHashes(now), gallery, "the gallery");
    assert.equal(now.publish.live, "current");

    for (const view of ["published", "previewDrafts"]) {
      const series = seriesOf(SLUG, view);
      assert.equal(series.schedule, "repeating", `${view}: a series`);
      assert.equal(series.recurrence, "Every Thursday", view);
      assert.deepEqual(series.gallery.map((image) => hashOf(image.asset._ref)), gallery, `${view}: the gallery`);
      assert.equal(series.heroImage.asset._ref, before.mainImage.asset, `${view}: the picture`);
      const nights = nightsOf(SLUG, view);
      assert.deepEqual(nights.map((night) => night.date), THURSDAYS, `${view}: a page for each Thursday`);
      for (const night of nights) {
        assert.deepEqual([night.title, night.ticketStart, night.ticketEnd, night.artist ?? ""], ["Chez Pickle", "17:00", "22:00", ""], view);
      }
    }
    return now;
  }

  it("makes it weekly on Thursdays to the 26th, clears the guest, adds the photos, puts it on the website; then nothing to do", async () => {
    const db = createTestD1("ops");
    const { event, jazz, env } = await seed(db);
    assert.deepEqual(event.dates.map((night) => night.date), [FIRST], "a one-off to begin with");
    assert.deepEqual(
      photos.map((photo) => photo.name),
      ["1-burger.jpg", "2-burgers-steaming.jpg", "3-patty-on-the-griddle.jpg"],
      "the three burger photos from WhatsApp",
    );
    const jazzBefore = JSON.stringify([await getEvent(env, jazz.id), docsOf(jazz.slug, "raw")]);

    const lines = await run(db);

    await assertThursdays(env, event, photos.map((photo) => photo.sha1));
    assert.equal(JSON.stringify([await getEvent(env, jazz.id), docsOf(jazz.slug, "raw")]), jazzBefore, "Jazz Night is untouched");
    const text = lines.join("\n");
    assert.match(
      text,
      new RegExp(`"Chez Pickle" \\(event ${event.id}\\) is now every Thursday from ${FIRST} to ${LAST}: 3 nights, 2026-11-12, 2026-11-19 and 2026-11-26, 17:00 to 22:00; it was a one-off on ${FIRST}`),
    );
    assert.match(text, new RegExp(`its guest "${GUEST}" is cleared: a pop-up kitchen shows none`));
    assert.match(text, new RegExp(`added 3 photos to its gallery: ${photos.map((photo) => photo.name).join(", ")}`));
    assert.match(text, /on the website: \/whats-on\/chez-pickle, every Thursday to 2026-11-26, with 3 photos in its gallery/);

    const before = [await dump(db), outside()];
    const calls = writes();
    const again = await run(db);
    assert.deepEqual([await dump(db), outside()], before, "a second run changes nothing");
    assert.equal(writes(), calls, "and writes nothing anywhere");
    assert.deepEqual(again, [
      `Nothing to do: "Chez Pickle" (event ${event.id}) is every Thursday from ${FIRST} to ${LAST}, with no guest and its 3 photos, and the website is in step.`,
    ]);
  });

  it("adds no photo the gallery already has (dev has all three, added by hand)", async () => {
    const db = createTestD1("ops");
    const { event, env } = await seed(db);
    // As in dev: added in ops in reverse, so the gallery (newest first) reads 1, 2, 3.
    for (const photo of [...photos].reverse()) {
      await addGalleryImage(env, event.id, { bytes: photo.bytes, filename: "WhatsApp.jpeg", contentType: "image/jpeg" });
    }
    await untilReady(env, event.id);
    const before = await getEvent(env, event.id);

    const lines = await run(db);

    await assertThursdays(env, before, photos.map((photo) => photo.sha1));
    const text = lines.join("\n");
    assert.doesNotMatch(text, /added \d+ photo/);
    assert.match(text, new RegExp(`already in its gallery: ${photos.map((photo) => photo.name).join(", ")}`));
  });

  it("adds only the photos it hasn't got: one already in the gallery, one that is its main picture", async () => {
    const db = createTestD1("ops");
    const [first, second, third] = photos;
    const { event, env } = await seed(db, { picture: third.bytes });
    await addGalleryImage(env, event.id, { bytes: first.bytes, filename: "WhatsApp.jpeg", contentType: "image/jpeg" });
    await untilReady(env, event.id);
    const before = await getEvent(env, event.id);

    const lines = await run(db);

    await assertThursdays(env, before, [second.sha1, first.sha1]);
    const text = lines.join("\n");
    assert.match(text, new RegExp(`already in its gallery: ${first.name}`));
    assert.match(text, new RegExp(`not added, it is its main picture already: ${third.name}`));
    assert.match(text, new RegExp(`added 1 photo to its gallery: ${second.name}`));
  });

  it("leaves a schedule that is already Thursdays to the 26th, and still clears the guest and adds the photos", async () => {
    const db = createTestD1("ops");
    const { event, env } = await seed(db, { series: { repeatUnit: "week", weekdays: ["thu"], endsOn: LAST } });
    assert.deepEqual(event.dates.map((night) => night.date), THURSDAYS);

    const lines = await run(db);

    const now = await assertThursdays(env, event, photos.map((photo) => photo.sha1));
    assert.deepEqual(now.dates.map((night) => night.id), event.dates.map((night) => night.id), "the same nights");
    const text = lines.join("\n");
    assert.doesNotMatch(text, /is now every Thursday/);
    assert.match(text, /its guest "KITCHEN POP UP" is cleared/);
    assert.match(text, /added 3 photos/);
  });

  for (const [what, series, now] of [
    ["a one-off on a Wednesday", { startsOn: "2026-11-11" }, "a one-off on 2026-11-11, a Wednesday"],
    ["every day into December", { repeatUnit: "day", endsOn: "2026-12-20" }, "every day from 2026-11-12 to 2026-12-20"],
  ]) {
    it(`leaves the schedule alone when it is ${what}, and says so; the guest and photos still change`, async () => {
      const db = createTestD1("ops");
      const { event, env } = await seed(db, { series });

      const lines = await run(db);

      const after = await getEvent(env, event.id);
      for (const key of ["repeatUnit", "weekdays", "startsOn", "endsOn"]) assert.deepEqual(after[key], event[key], key);
      assert.deepEqual(after.dates.map((night) => night.id), event.dates.map((night) => night.id), "the same nights");
      assert.equal(after.artist, "");
      assert.deepEqual(galleryHashes(after), photos.map((photo) => photo.sha1));
      assert.equal(after.publish.live, "current");
      assert.match(
        lines.join("\n"),
        new RegExp(`left alone: the schedule of "Chez Pickle" \\(event ${event.id}\\) is ${now}, not the one-off on a Thursday it was; it was not changed`),
      );
    });
  }

  it("stops with a clear message when there is no Chez Pickle, and changes nothing", async () => {
    const db = createTestD1("ops");
    await add(db, { name: "Jazz Night", description: "Jazz.", startsOn: "2026-11-19", startTime: "19:00", repeatUnit: "once" });
    const before = [await dump(db), outside()];
    await assert.rejects(run(db), /Chez Pickle was not found: no event at \/whats-on\/chez-pickle/);
    assert.deepEqual([await dump(db), outside()], before);
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
    assert.match(text, new RegExp(`would change events ${event.id} "Chez Pickle": .*artist "${GUEST}" → nothing`));
    assert.match(text, /repeatUnit "once" → "week"/);
    assert.match(text, /weekdays \[\] → \["thu"\]/);
    assert.match(text, new RegExp(`endsOn nothing → "${LAST}"`));
    assert.match(text, new RegExp(`"Chez Pickle" \\(event ${event.id}\\) would be every Thursday from ${FIRST} to ${LAST}: 3 nights, 2026-11-12, 2026-11-19 and 2026-11-26, 17:00 to 22:00`));
    assert.match(text, new RegExp(`would add 3 photos to its gallery: ${photos.map((photo) => photo.name).join(", ")}`));
    assert.match(text, /would put it on the website \(\/whats-on\/chez-pickle\)/);
  });
});
