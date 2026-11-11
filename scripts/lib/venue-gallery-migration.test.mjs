/**
 * migrations/2026-11-11-venue-gallery.mjs, run as a deploy runs it against a
 * D1 with the real schema, with Sanity, Google Calendar and Drive faked: the
 * plan from photos.json, a dry run, for real, again (nothing left to do),
 * after the owner changed the Gallery, with a photo the owner says is an
 * event's, and naming an event that isn't there. What the website shows is
 * the website's own query (marketing/web/src/lib/venue-details.js).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluate, parse } from "groq-js";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { VENUE_DETAILS_QUERY, readVenueDetails } from "../../marketing/web/src/lib/venue-details.js";
import { parseImageAssetId } from "../../shared/sanity-image.js";
import { d1EventRepository } from "../../ops/site/src/events/server/adapters/d1-events.js";
import { d1MenuRepository } from "../../ops/site/src/menu/server/adapters/d1-menu.js";
import { d1VenueRepository } from "../../ops/site/src/venue/server/adapters/d1-venue.js";
import { createEvent, getEvent, setEventImage } from "../../ops/site/src/events/server/event-store.js";
import { runWebsiteJob } from "../../ops/site/src/events/server/website-jobs.js";
import { removeGalleryPhoto } from "../../ops/site/src/venue/server/venue-gallery.js";
import { createFakeWorld } from "../../ops/site/src/testing/fake-world.js";
import { createTestD1 } from "../../shared/testing/d1-sqlite.js";
import * as venueGallery from "../../migrations/2026-11-11-venue-gallery.mjs";

const LIST = JSON.parse(await readFile(venueGallery.LIST, "utf8"));
const BURGERS = ["food/chez-pickle-burger.jpg", "gallery/burger-fresh-off-the-grill.jpg", "gallery/burger-on-the-griddle.jpg"];
/** The venue's photos, as photos.json lists them: all but Chez Pickle's burgers. */
const VENUE = LIST.filter((entry) => !BURGERS.includes(entry.file));
const hashOf = (asset) => parseImageAssetId(asset)?.sha1;

describe("2026-11-11-venue-gallery", () => {
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

  const opsEnv = (db) => ({
    ...world.env,
    eventRepository: d1EventRepository(db),
    menuRepository: d1MenuRepository(db),
    venueRepository: d1VenueRepository(db),
  });

  async function run(db, { dryRun = false, eventPhotos } = {}) {
    const lines = [];
    const result = await venueGallery.up({
      env: "dev",
      d1: () => db,
      processEnv: world.env,
      dryRun,
      log: (line) => lines.push(line),
      ...(eventPhotos ? { eventPhotos } : {}),
    });
    return { lines, text: lines.join("\n"), result };
  }

  /** The venue's photos a site build reads: the live site's published documents. */
  async function websiteGallery(view = "published") {
    const docs = world.sanity.view(view);
    return readVenueDetails(await (await evaluate(parse(VENUE_DETAILS_QUERY), { dataset: docs })).get()).gallery;
  }

  /** An event as ops makes it, with its picture, on the website. */
  async function addEvent(db, fields) {
    const env = opsEnv(db);
    const event = await createEvent(env, { repeatEvery: 1, startTime: "19:00", repeatUnit: "once", startsOn: "2026-11-19", ...fields });
    await setEventImage(env, event.id, { bytes: new TextEncoder().encode(fields.name), filename: "picture.png", contentType: "image/png" });
    for (let step = 0; step < 60; step += 1) {
      const result = await runWebsiteJob(env, { eventId: event.id });
      assert.equal(result.failed || "", "", `website job failed: ${result.failed}`);
      if (result.done) break;
    }
    return getEvent(env, event.id);
  }

  it("plans the list: the venue's photos in its order with their words and boards, Chez Pickle's burgers left out", async () => {
    const plan = await venueGallery.planPhotos();
    assert.deepEqual(
      plan.venue.map((photo) => photo.file),
      VENUE.map((entry) => entry.file),
    );
    assert.deepEqual(
      plan.already.map((photo) => photo.file),
      BURGERS,
    );
    assert.deepEqual(plan.events, []);
    assert.deepEqual(
      plan.venue.map((photo) => [photo.description, photo.menu]),
      VENUE.map((entry) => [entry.alt, entry.menu || ""]),
    );
    assert.equal(plan.venue[0].contentType, "image/webp");
    assert.match(plan.venue[0].sha1, /^[0-9a-f]{40}$/);
    // The four the owner may say are an event's are still the venue's
    for (const file of ["gallery/focaccia-and-fries.webp", "gallery/decks.webp", "gallery/pizza-bread-and-fries.webp", "gallery/crocchette.webp"]) {
      assert.ok(plan.venue.some((photo) => photo.file === file), file);
    }
  });

  it("refuses an event photo photos.json hasn't got", async () => {
    await assert.rejects(
      () => venueGallery.planPhotos({ eventPhotos: [{ file: "gallery/nope.webp", event: "jazz-night" }] }),
      /EVENT_PHOTOS names photos photos.json hasn't got: gallery\/nope\.webp/,
    );
  });

  it("a dry run changes nothing anywhere, and says what it would do", async () => {
    const db = createTestD1("ops");
    const before = world.sanity.view("raw").length;
    const { text, result } = await run(db, { dryRun: true });
    assert.deepEqual(result, { gallery: VENUE.length, events: 0, removed: 0, published: false });
    assert.deepEqual(await d1VenueRepository(db).listGallery(), []);
    assert.equal(world.sanity.view("raw").length, before);
    assert.match(text, /Dry run: working on a copy/);
    assert.match(text, /left out: food\/chez-pickle-burger\.jpg, gallery\/burger-fresh-off-the-grill\.jpg, gallery\/burger-on-the-griddle\.jpg: in the gallery of \/whats-on\/chez-pickle already/);
    assert.match(text, new RegExp(`would add ${VENUE.length} photos to the Gallery, in this order`));
    assert.match(text, /1\. gallery\/focaccia-and-fries\.webp: A focaccia filled with mortadella/);
    assert.match(text, /gallery\/cocktail-on-the-terrace\.webp: .*, on the Drinks board/);
  });

  it("for real: the Gallery has the venue's photos in order, and the website shows them", async () => {
    const db = createTestD1("ops");
    const { text, result } = await run(db);
    assert.deepEqual(result, { gallery: VENUE.length, events: 0, removed: 0, published: true });

    const gallery = await d1VenueRepository(db).listGallery();
    assert.deepEqual(
      gallery.map((photo) => [photo.description, photo.menu, photo.addedBy]),
      VENUE.map((entry) => [entry.alt, entry.menu || "", venueGallery.ADDED_BY]),
    );
    // Each is the file's own bytes on Sanity
    const plan = await venueGallery.planPhotos();
    assert.deepEqual(
      gallery.map((photo) => hashOf(photo.asset)),
      plan.venue.map((photo) => photo.sha1),
    );
    // No burger: they're Chez Pickle's
    const burgers = new Set(plan.already.map((photo) => photo.sha1));
    assert.equal(gallery.filter((photo) => burgers.has(hashOf(photo.asset))).length, 0);

    const website = await websiteGallery();
    assert.deepEqual(
      website.map((photo) => photo.alt),
      VENUE.map((entry) => entry.alt),
    );
    assert.equal(website[0].width, 800);
    assert.match(text, new RegExp(`added ${VENUE.length} photos to the Gallery`));
    assert.match(text, /put the Gallery on the website/);
  });

  it("does nothing the second time", async () => {
    const db = createTestD1("ops");
    await run(db);
    const before = JSON.stringify(await d1VenueRepository(db).exportAll());
    const { text, result } = await run(db);
    assert.deepEqual(result, { gallery: 0, events: 0, removed: 0, published: false });
    assert.equal(JSON.stringify(await d1VenueRepository(db).exportAll()), before);
    assert.match(text, /left alone: the Gallery has 16 photos already[\s\S]*the website shows them; nothing to do/);
  });

  it("leaves a Gallery the owner has changed as it is", async () => {
    const db = createTestD1("ops");
    await run(db);
    const env = opsEnv(db);
    const [first] = await d1VenueRepository(db).listGallery();
    await removeGalleryPhoto(env, first.key);
    await run(db);
    const gallery = await d1VenueRepository(db).listGallery();
    assert.equal(gallery.length, VENUE.length - 1);
    assert.ok(!gallery.some((photo) => photo.asset === first.asset));
  });

  it("finishes a run that saved the Gallery in ops but never reached the website", async () => {
    const db = createTestD1("ops");
    await run(db);
    const saved = JSON.stringify(await d1VenueRepository(db).exportAll());
    // As if the website never got it
    world.sanity.docs.delete("venueDetails");
    assert.deepEqual(await websiteGallery(), []);
    const { text, result } = await run(db);
    assert.deepEqual(result, { gallery: 0, events: 0, removed: 0, published: true });
    assert.match(text, /left alone: the Gallery has 16 photos already[\s\S]*put the Gallery on the website/);
    assert.equal((await websiteGallery()).length, VENUE.length);
    assert.equal(JSON.stringify(await d1VenueRepository(db).exportAll()), saved);
  });

  it("an event's photo goes in that event's gallery, not the Gallery, and comes out of the Gallery if an earlier run put it there", async () => {
    const db = createTestD1("ops");
    const jazz = await addEvent(db, { name: "Jazz Night", description: "Jazz." });
    // First without the owner's word: the decks are the venue's
    await run(db);
    const plan = await venueGallery.planPhotos();
    const decks = plan.venue.find((photo) => photo.file === "gallery/decks.webp");
    assert.ok((await d1VenueRepository(db).listGallery()).some((photo) => hashOf(photo.asset) === decks.sha1));

    const eventPhotos = [...venueGallery.EVENT_PHOTOS, { file: "gallery/decks.webp", event: jazz.slug }];
    const dry = await run(db, { dryRun: true, eventPhotos });
    assert.match(dry.text, /would take gallery\/decks\.webp out of the Gallery/);
    assert.match(dry.text, /would add 1 photo to "Jazz Night" \(event \d+\)'s gallery: gallery\/decks\.webp/);

    const { text, result } = await run(db, { eventPhotos });
    assert.deepEqual(result, { gallery: 0, events: 1, removed: 1, published: false });
    const gallery = await d1VenueRepository(db).listGallery();
    assert.equal(gallery.length, VENUE.length - 1);
    assert.ok(!gallery.some((photo) => hashOf(photo.asset) === decks.sha1));
    assert.ok(!(await websiteGallery()).some((photo) => photo.alt === decks.description));
    const event = await getEvent(opsEnv(db), jazz.id);
    assert.deepEqual(
      event.gallery.map((photo) => hashOf(photo.asset)),
      [decks.sha1],
    );
    assert.match(text, /took gallery\/decks\.webp out of the Gallery/);
    assert.match(text, /added 1 photo to "Jazz Night" \(event \d+\)'s gallery: gallery\/decks\.webp/);

    // Again: nothing left to do
    const again = await run(db, { eventPhotos });
    assert.deepEqual(again.result, { gallery: 0, events: 0, removed: 0, published: false });
    assert.match(again.text, /already in "Jazz Night" \(event \d+\)'s gallery: gallery\/decks\.webp/);
  });

  it("an event photo before the first run never goes in the Gallery", async () => {
    const db = createTestD1("ops");
    const jazz = await addEvent(db, { name: "Jazz Night", description: "Jazz." });
    const eventPhotos = [...venueGallery.EVENT_PHOTOS, { file: "gallery/crocchette.webp", event: jazz.slug }];
    const { result } = await run(db, { eventPhotos });
    assert.deepEqual(result, { gallery: VENUE.length - 1, events: 1, removed: 0, published: true });
    assert.equal((await getEvent(opsEnv(db), jazz.id)).gallery.length, 1);
  });

  it("stops with a clear message for an event that isn't there", async () => {
    const db = createTestD1("ops");
    const eventPhotos = [...venueGallery.EVENT_PHOTOS, { file: "gallery/decks.webp", event: "no-such-night" }];
    await assert.rejects(() => run(db, { eventPhotos }), /No event at \/whats-on\/no-such-night/);
  });
});
