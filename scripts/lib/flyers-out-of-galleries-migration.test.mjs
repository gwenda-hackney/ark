/**
 * migrations/2026-11-11-flyers-out-of-galleries.mjs, run as a deploy runs it
 * against a D1 with the real schema, with Sanity, Google Calendar and Drive
 * faked: for real, again (nothing left to do), halfway, with nothing to take
 * off, an event not found, and as a dry run.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { d1EventRepository } from "../../ops/site/src/events/server/adapters/d1-events.js";
import { d1MenuRepository } from "../../ops/site/src/menu/server/adapters/d1-menu.js";
import {
  addGalleryImage,
  createEvent,
  getEvent,
  removeGalleryImage,
  setEventImage,
  updateEvent,
} from "../../ops/site/src/events/server/event-store.js";
import { runWebsiteJob } from "../../ops/site/src/events/server/website-jobs.js";
import { createFakeWorld } from "../../ops/site/src/testing/fake-world.js";
import { createTestD1 } from "../../shared/testing/d1-sqlite.js";
import * as flyersOut from "../../migrations/2026-11-11-flyers-out-of-galleries.mjs";

const COCKTAIL = { slug: "from-wednesday-to-saturday-is-the-cocktail-hour", name: "Cocktail Hour 🍹" };
const FRIDAY = { slug: "music-friday", name: "Friday, With Guests" };
const COCKTAIL_FLYER = new TextEncoder().encode("the Cocktail Hour flyer");
const BAR = new TextEncoder().encode("a photo of the bar");
const TURNTABLES = new TextEncoder().encode("the turntables at the bar");
const CROWD = new TextEncoder().encode("a Friday crowd");
/** Andy Caruso's flyer for 2 October in Friday, With Guests' gallery, exactly as production has it (from the Drive copy). */
const CARUSO = {
  key: "1WLaSJiVpBJDlSpMvku8D8togfYyChPGG",
  asset: "image-c27f2e8ad4e270a65182ef8aa5f303e31b03a650-1254x1254-png",
  date: "",
  added: "2026-09-26T14:47:18.754Z",
  source: "drive:1WLaSJiVpBJDlSpMvku8D8togfYyChPGG",
};

describe("2026-11-11-flyers-out-of-galleries", () => {
  let world;
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-11T12:00:00Z") });
    world = await createFakeWorld();
    world.install();
  });
  afterEach(() => {
    world.restore();
    vi.useRealTimers();
  });

  const opsEnv = (db) => ({ ...world.env, eventRepository: d1EventRepository(db), menuRepository: d1MenuRepository(db) });

  async function untilReady(env, id) {
    for (let step = 0; step < 80; step += 1) {
      const result = await runWebsiteJob(env, { eventId: id });
      assert.equal(result.failed || "", "", `website job failed: ${result.failed}`);
      if (result.done) return;
    }
    throw new Error("the website job never finished");
  }

  const upload = (bytes) => ({ bytes, filename: "photo.jpg", contentType: "image/jpeg" });

  /**
   * The Cocktail Hour as production has it: entered under its long name (so
   * its web address), renamed since, a weekly promotion with its flyer as the
   * main image and the same flyer in its gallery, live. `gallery`: what is
   * in its gallery, oldest first.
   */
  async function seedCocktailHour(env, { gallery = [COCKTAIL_FLYER, BAR] } = {}) {
    const created = await createEvent(env, {
      name: "From Wednesday to Saturday is the Cocktail Hour 🍹",
      category: "promotion",
      description: "20% off all cocktails, Wednesday to Saturday.",
      shortDescription: "20% OFF ALL COCKTAIL",
      offer: "20% OFF",
      startsOn: "2026-11-05",
      startTime: "17:00",
      endTime: "18:30",
      repeatUnit: "week",
      repeatEvery: 1,
      weekdays: ["wed", "thu", "fri", "sat"],
    });
    await updateEvent(env, created.id, { name: COCKTAIL.name });
    await setEventImage(env, created.id, upload(COCKTAIL_FLYER));
    for (const bytes of gallery) await addGalleryImage(env, created.id, upload(bytes));
    await untilReady(env, created.id);
    return getEvent(env, created.id);
  }

  /**
   * Friday, With Guests as production has it: entered as "Music Friday" (so
   * its web address), renamed since, Fridays to 11 December, a photo of the
   * turntables as its main image, and in its gallery a real photo and Andy
   * Caruso's flyer, copied in from Drive. Live.
   */
  async function seedFriday(env, { caruso = true } = {}) {
    const created = await createEvent(env, {
      name: "Music Friday",
      description: "Guest DJs on Fridays.",
      startsOn: "2026-10-02",
      endsOn: "2026-12-11",
      startTime: "20:00",
      endTime: "23:00",
      repeatUnit: "week",
      repeatEvery: 1,
      weekdays: ["fri"],
    });
    await updateEvent(env, created.id, { name: FRIDAY.name });
    await setEventImage(env, created.id, upload(TURNTABLES));
    await addGalleryImage(env, created.id, upload(CROWD));
    if (caruso) await env.eventRepository.addGalleryPhoto(created.id, CARUSO);
    await untilReady(env, created.id);
    return getEvent(env, created.id);
  }

  /** Both, and a night that is neither, with Andy Caruso's flyer in its own gallery. */
  async function seed(db, { cocktail = {}, friday = {}, only = ["cocktail", "friday"] } = {}) {
    const env = opsEnv(db);
    const events = {};
    if (only.includes("cocktail")) events.cocktail = await seedCocktailHour(env, cocktail);
    if (only.includes("friday")) events.friday = await seedFriday(env, friday);
    const jazz = await createEvent(env, { name: "Jazz Night", description: "Jazz.", startsOn: "2026-11-19", startTime: "19:00", repeatUnit: "once", repeatEvery: 1 });
    await env.eventRepository.addGalleryPhoto(jazz.id, { ...CARUSO, key: "jazzcaruso" });
    await untilReady(env, jazz.id);
    return { ...events, jazz: await getEvent(env, jazz.id), env };
  }

  async function run(db, { dryRun = false } = {}) {
    const lines = [];
    await flyersOut.up({ env: "dev", d1: () => db, processEnv: world.env, dryRun, log: (line) => lines.push(line) });
    return lines;
  }

  const dump = async (db) => JSON.stringify(await d1EventRepository(db).exportAll());
  const outside = () =>
    JSON.stringify([
      world.sanity.view("raw").map(({ _rev, _updatedAt, _createdAt, ...doc }) => doc).sort((a, b) => a._id.localeCompare(b._id)),
      world.google.calendar().map((entry) => entry.id).sort(),
      [...world.google.driveFiles.values()].map((file) => [file.id, Boolean(file.trashed)]),
    ]);
  const writes = () => world.calls.filter((call) => !call.startsWith("GET ") && !call.includes("oauth2")).length;
  const seriesDoc = (slug, view) => world.sanity.view(view).find((doc) => doc._id.replace(/^drafts\./, "") === `series-${slug}`);
  const websiteGallery = (slug, view) => (seriesDoc(slug, view)?.gallery || []).map((image) => image.asset._ref);
  const title = (event) => `"${event.name}" \\(event ${event.id}\\)`;

  /** The flyer is out of the gallery, in ops and on the website; the other photo and the main image stay. */
  async function assertFlyerOut(env, before, flyer) {
    const now = await getEvent(env, before.id);
    const kept = before.gallery.filter((photo) => photo.asset !== flyer);
    assert.equal(kept.length, 1, "one real photo besides the flyer");
    assert.equal(now.mainImage?.asset, before.mainImage.asset, "the main image stays");
    assert.deepEqual(now.gallery.map((photo) => photo.key), [kept[0].key], "only the real photo is left in the gallery");
    for (const key of ["name", "slug", "description", "shortDescription", "offer", "startTime", "endTime", "category", "repeatUnit", "weekdays", "startsOn", "endsOn"]) {
      assert.deepEqual(now[key], before[key], `its ${key} stays`);
    }
    assert.deepEqual(now.dates.map((night) => night.id), before.dates.map((night) => night.id), "the same nights");
    assert.equal(now.publish.live, "current");
    for (const view of ["published", "previewDrafts"]) {
      assert.deepEqual(websiteGallery(before.slug, view), [kept[0].asset], `${view}: the website's gallery drops the flyer`);
      assert.equal(seriesDoc(before.slug, view).heroImage.asset._ref, before.mainImage.asset, `${view}: the main image stays`);
    }
    return now;
  }

  const nothingToDo = (cocktail, friday) => [
    `Nothing to do: no photo in the gallery of "${cocktail.name}" (event ${cocktail.id}) is the same picture as its main image, in ops or on the website.`,
    `Nothing to do: no photo in the gallery of "${friday.name}" (event ${friday.id}) is Andy Caruso's flyer for 2 October (${CARUSO.asset}), in ops or on the website.`,
  ];

  it("takes each flyer off its gallery and the website; main images and other photos stay; then nothing to do", async () => {
    const db = createTestD1("ops");
    const { cocktail, friday, jazz, env } = await seed(db);
    const doubled = cocktail.gallery.find((photo) => photo.asset === cocktail.mainImage.asset);
    assert.ok(doubled, "the Cocktail Hour's flyer is in its gallery to begin with");
    assert.ok(websiteGallery(COCKTAIL.slug, "published").includes(cocktail.mainImage.asset), "and on the website");
    assert.ok(friday.gallery.some((photo) => photo.key === CARUSO.key), "Andy Caruso's flyer is in Friday's gallery");
    assert.ok(websiteGallery(FRIDAY.slug, "published").includes(CARUSO.asset), "and on the website");
    const jazzBefore = JSON.stringify(await getEvent(env, jazz.id));

    const lines = await run(db);

    await assertFlyerOut(env, cocktail, cocktail.mainImage.asset);
    await assertFlyerOut(env, friday, CARUSO.asset);
    assert.equal(JSON.stringify(await getEvent(env, jazz.id)), jazzBefore, "another event keeps the same flyer in its gallery");
    const text = lines.join("\n");
    assert.match(
      text,
      new RegExp(`took photo ${doubled.key} off the gallery of ${title(cocktail)}: it is the same picture as its main image \\(${cocktail.mainImage.asset}\\); its main image stays`),
    );
    assert.match(text, new RegExp(`"${COCKTAIL.name}" is on the website without it: /whats-on/${COCKTAIL.slug}, 1 photo left in its gallery`));
    assert.match(
      text,
      new RegExp(`took photo ${CARUSO.key} off the gallery of ${title(friday)}: it is Andy Caruso's flyer for 2 October \\(${CARUSO.asset}\\); its main image stays`),
    );
    assert.match(text, new RegExp(`"${FRIDAY.name}" is on the website without it: /whats-on/${FRIDAY.slug}, 1 photo left in its gallery`));

    const before = [await dump(db), outside()];
    const calls = writes();
    const again = await run(db);
    assert.deepEqual([await dump(db), outside()], before, "a second run changes nothing");
    assert.equal(writes(), calls, "and writes nothing anywhere");
    assert.deepEqual(again, nothingToDo(cocktail, friday));
  });

  it("finishes a run that stopped after ops: the flyers still leave the website", async () => {
    const db = createTestD1("ops");
    const { cocktail, friday, env } = await seed(db);
    const doubled = cocktail.gallery.find((photo) => photo.asset === cocktail.mainImage.asset);
    await removeGalleryImage(env, cocktail.id, doubled.key);
    await removeGalleryImage(env, friday.id, CARUSO.key);
    assert.ok(websiteGallery(COCKTAIL.slug, "published").includes(cocktail.mainImage.asset), "still on the website");
    assert.ok(websiteGallery(FRIDAY.slug, "published").includes(CARUSO.asset), "still on the website");

    const lines = await run(db);

    await assertFlyerOut(env, cocktail, cocktail.mainImage.asset);
    await assertFlyerOut(env, friday, CARUSO.asset);
    const text = lines.join("\n");
    assert.match(text, new RegExp(`"${COCKTAIL.name}" is on the website without it`));
    assert.match(text, new RegExp(`"${FRIDAY.name}" is on the website without it`));
  });

  it("does nothing when no gallery has its flyer", async () => {
    const db = createTestD1("ops");
    const { cocktail, friday } = await seed(db, { cocktail: { gallery: [BAR] }, friday: { caruso: false } });
    const before = [await dump(db), outside()];
    const calls = writes();

    const lines = await run(db);

    assert.deepEqual([await dump(db), outside()], before);
    assert.equal(writes(), calls);
    assert.deepEqual(lines, nothingToDo(cocktail, friday));
  });

  it("does the events it finds, then stops with a clear message naming the one it didn't", async () => {
    const db = createTestD1("ops");
    const { cocktail, env } = await seed(db, { only: ["cocktail"] });

    await assert.rejects(run(db), new RegExp(`Friday, With Guests was not found: no event at /whats-on/${FRIDAY.slug}.*The others were done`));

    await assertFlyerOut(env, cocktail, cocktail.mainImage.asset);
  });

  it("changes nothing when it finds none of them", async () => {
    const db = createTestD1("ops");
    await seed(db, { only: [] });
    const before = [await dump(db), outside()];
    await assert.rejects(run(db), /The Cocktail Hour was not found: .* Friday, With Guests was not found: .* Nothing was changed/);
    assert.deepEqual([await dump(db), outside()], before);
  });

  it("a dry run changes nothing in ops, on the website, the calendar or Drive, and says what it would do", async () => {
    const db = createTestD1("ops");
    const { cocktail, friday } = await seed(db);
    const doubled = cocktail.gallery.find((photo) => photo.asset === cocktail.mainImage.asset);
    const before = [await dump(db), outside()];
    const calls = writes();

    const lines = await run(db, { dryRun: true });

    assert.deepEqual([await dump(db), outside()], before);
    assert.equal(writes(), calls, "nothing sent that writes");
    const text = lines.join("\n");
    assert.match(text, /^Dry run: working on a copy of the data/);
    assert.match(text, new RegExp(`would take photo ${doubled.key} off the gallery of ${title(cocktail)}: it is the same picture as its main image`));
    assert.match(text, new RegExp(`would put "${COCKTAIL.name}" on the website without it \\(/whats-on/${COCKTAIL.slug}\\), 1 photo left in its gallery`));
    assert.match(text, new RegExp(`would take photo ${CARUSO.key} off the gallery of ${title(friday)}: it is Andy Caruso's flyer for 2 October`));
    assert.match(text, new RegExp(`would put "${FRIDAY.name}" on the website without it \\(/whats-on/${FRIDAY.slug}\\), 1 photo left in its gallery`));
  });
});
