/**
 * migrations/2026-11-11-cocktail-hour-gallery.mjs, run as a deploy runs it
 * against a D1 with the real schema, with Sanity, Google Calendar and Drive
 * faked: for real, again (nothing left to do), halfway, with nothing to take
 * off, not found, and as a dry run.
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
import * as cocktailHour from "../../migrations/2026-11-11-cocktail-hour-gallery.mjs";

const { SLUG } = cocktailHour;
const NAME = "Cocktail Hour 🍹";
const FLYER = new TextEncoder().encode("the Cocktail Hour flyer");
const BAR = new TextEncoder().encode("a photo of the bar");

describe("2026-11-11-cocktail-hour-gallery", () => {
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
   * main image and the same flyer in its gallery, live. `gallery`: what else
   * is in the gallery, oldest first.
   */
  async function seed(db, { gallery = [FLYER, BAR] } = {}) {
    const env = opsEnv(db);
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
    await updateEvent(env, created.id, { name: NAME });
    await setEventImage(env, created.id, upload(FLYER));
    for (const bytes of gallery) await addGalleryImage(env, created.id, upload(bytes));
    await untilReady(env, created.id);
    const jazz = await createEvent(env, { name: "Jazz Night", description: "Jazz.", startsOn: "2026-11-19", startTime: "19:00", repeatUnit: "once", repeatEvery: 1 });
    await addGalleryImage(env, jazz.id, upload(FLYER));
    await untilReady(env, jazz.id);
    return { event: await getEvent(env, created.id), jazz: await getEvent(env, jazz.id), env };
  }

  async function run(db, { dryRun = false } = {}) {
    const lines = [];
    await cocktailHour.up({ env: "dev", d1: () => db, processEnv: world.env, dryRun, log: (line) => lines.push(line) });
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
  const seriesDoc = (view) => world.sanity.view(view).find((doc) => doc._id.replace(/^drafts\./, "") === `series-${SLUG}`);
  const websiteGallery = (view) => (seriesDoc(view)?.gallery || []).map((image) => image.asset._ref);

  /** The flyer is the main image only; the bar photo stays in the gallery; the website agrees. */
  async function assertFlyerOnlyMain(env, before) {
    const now = await getEvent(env, before.id);
    const flyer = before.mainImage.asset;
    const bar = before.gallery.find((photo) => photo.asset !== flyer);
    assert.equal(now.mainImage?.asset, flyer, "the main image stays");
    assert.deepEqual(now.gallery.map((photo) => photo.key), [bar.key], "only the bar photo is left in the gallery");
    for (const key of ["name", "slug", "description", "shortDescription", "offer", "startTime", "endTime", "category", "repeatUnit", "weekdays", "startsOn", "endsOn"]) {
      assert.deepEqual(now[key], before[key], `its ${key} stays`);
    }
    assert.deepEqual(now.dates.map((night) => night.id), before.dates.map((night) => night.id), "the same nights");
    assert.equal(now.publish.live, "current");
    for (const view of ["published", "previewDrafts"]) {
      assert.deepEqual(websiteGallery(view), [bar.asset], `${view}: the website's gallery drops the flyer`);
      assert.equal(seriesDoc(view).heroImage.asset._ref, flyer, `${view}: the flyer is still the main image`);
    }
    return now;
  }

  it("takes the photo that is the main image off the gallery and the website; the main image stays; then nothing to do", async () => {
    const db = createTestD1("ops");
    const { event, jazz, env } = await seed(db);
    const flyer = event.mainImage.asset;
    assert.deepEqual(event.gallery.map((photo) => photo.asset).sort(), [flyer, event.gallery.find((p) => p.asset !== flyer).asset].sort());
    assert.ok(websiteGallery("published").includes(flyer), "the website shows the flyer in the gallery to begin with");
    const doubled = event.gallery.find((photo) => photo.asset === flyer);
    const jazzBefore = JSON.stringify(await getEvent(env, jazz.id));

    const lines = await run(db);

    await assertFlyerOnlyMain(env, event);
    assert.equal(JSON.stringify(await getEvent(env, jazz.id)), jazzBefore, "Jazz Night keeps the same picture in its gallery");
    const text = lines.join("\n");
    assert.match(
      text,
      new RegExp(`took photo ${doubled.key} off the gallery of "${NAME}" \\(event ${event.id}\\): it is the same picture as its main image \\(${flyer}\\), which stays`),
    );
    assert.match(text, new RegExp(`"${NAME}" is on the website without it: /whats-on/${SLUG}, 1 photo left in its gallery`));

    const before = [await dump(db), outside()];
    const calls = writes();
    const again = await run(db);
    assert.deepEqual([await dump(db), outside()], before, "a second run changes nothing");
    assert.equal(writes(), calls, "and writes nothing anywhere");
    assert.deepEqual(again, [
      `Nothing to do: no photo in the gallery of "${NAME}" (event ${event.id}) is its main image, in ops or on the website.`,
    ]);
  });

  it("finishes a run that stopped after ops: the photo still leaves the website", async () => {
    const db = createTestD1("ops");
    const { event, env } = await seed(db);
    const doubled = event.gallery.find((photo) => photo.asset === event.mainImage.asset);
    await removeGalleryImage(env, event.id, doubled.key);
    assert.ok(websiteGallery("published").includes(event.mainImage.asset), "still on the website");

    const lines = await run(db);

    await assertFlyerOnlyMain(env, event);
    assert.match(lines.join("\n"), /is on the website without it/);
  });

  it("does nothing when no gallery photo is the main image", async () => {
    const db = createTestD1("ops");
    const { event } = await seed(db, { gallery: [BAR] });
    const before = [await dump(db), outside()];
    const calls = writes();

    const lines = await run(db);

    assert.deepEqual([await dump(db), outside()], before);
    assert.equal(writes(), calls);
    assert.deepEqual(lines, [
      `Nothing to do: no photo in the gallery of "${NAME}" (event ${event.id}) is its main image, in ops or on the website.`,
    ]);
  });

  it("stops with a clear message when there is no Cocktail Hour, and changes nothing", async () => {
    const db = createTestD1("ops");
    const env = opsEnv(db);
    await createEvent(env, { name: "Jazz Night", description: "Jazz.", startsOn: "2026-11-19", startTime: "19:00", repeatUnit: "once", repeatEvery: 1 });
    const before = [await dump(db), outside()];
    await assert.rejects(run(db), new RegExp(`The Cocktail Hour was not found: no event at /whats-on/${SLUG}`));
    assert.deepEqual([await dump(db), outside()], before);
  });

  it("a dry run changes nothing in ops, on the website, the calendar or Drive, and says what it would do", async () => {
    const db = createTestD1("ops");
    const { event } = await seed(db);
    const doubled = event.gallery.find((photo) => photo.asset === event.mainImage.asset);
    const before = [await dump(db), outside()];
    const calls = writes();

    const lines = await run(db, { dryRun: true });

    assert.deepEqual([await dump(db), outside()], before);
    assert.equal(writes(), calls, "nothing sent that writes");
    const text = lines.join("\n");
    assert.match(text, /^Dry run: working on a copy of the data/);
    assert.match(text, new RegExp(`would take photo ${doubled.key} off the gallery of "${NAME}" \\(event ${event.id}\\): it is the same picture as its main image`));
    assert.match(text, new RegExp(`would put it on the website without it \\(/whats-on/${SLUG}\\), 1 photo left in its gallery`));
  });
});
