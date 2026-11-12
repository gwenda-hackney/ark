/**
 * Use cases (#291): the owner keeps the venue's photos in ops (Gallery):
 * adds them, says what each shows, puts them in order, takes one out; and
 * the website shows them, in that order, at the top of the Photos page and
 * in home's photo strip. Real API handlers on a test D1, with Sanity and the
 * settings faked (testing/fake-world.js); "what the website shows" is the
 * website's own query (marketing/web/src/lib/venue-details.js) run against
 * the documents a build would read.
 */
import assert from "node:assert/strict";
import { evaluate, parse } from "groq-js";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { VENUE_DETAILS_QUERY, readVenueDetails } from "../../../../marketing/web/src/lib/venue-details.js";
import { createTestD1 } from "../../../../shared/testing/d1-sqlite.js";
import { callApi, createFakeWorld } from "../testing/fake-world.js";
import { onRequestGet as getGallery, onRequestPost as postPhoto, onRequestPut as putOrder } from "../../functions/api/venue/gallery.js";
import { onRequestDelete as deletePhoto, onRequestPatch as patchPhoto } from "../../functions/api/venue/gallery/[key].js";
import { onRequestPut as putHours } from "../../functions/api/venue/hours.js";
import { onRequestPut as putParties } from "../../functions/api/venue/parties.js";
import { onRequestPost as updateWebsite } from "../../functions/api/web/release.js";
import { onRequestPost as createEvent } from "../../functions/api/events/index.js";
import { onRequestPost as addEventPhoto } from "../../functions/api/events/[id]/gallery.js";
import { galleryFromEvents } from "./server/venue-gallery.js";

let world;
beforeEach(async () => {
  world = await createFakeWorld();
  world.install();
  world.env.OPS_DB = createTestD1("ops");
});
afterEach(() => world.restore());

/** A photo file: its bytes are its name, so each name is its own picture. */
function photoFile(name, type = "image/jpeg") {
  return new File([new TextEncoder().encode(`photo of ${name}`)], `${name}.jpg`, { type });
}

const read = () => callApi(world, getGallery, { path: "/api/venue/gallery" });

function add(name, { description = "", menu = "", type } = {}) {
  const body = new FormData();
  body.set("file", photoFile(name, type));
  if (description) body.set("description", description);
  if (menu) body.set("menu", menu);
  return callApi(world, postPhoto, { method: "POST", path: "/api/venue/gallery", body });
}

const describePhoto = (key, body) =>
  callApi(world, patchPhoto, { method: "PATCH", path: `/api/venue/gallery/${key}`, params: { key }, body });
const order = (keys) => callApi(world, putOrder, { method: "PUT", path: "/api/venue/gallery", body: { keys } });
const remove = (key) =>
  callApi(world, deletePhoto, { method: "DELETE", path: `/api/venue/gallery/${key}`, params: { key } });

/** The venue's photos a site build reads: the live site published documents, the preview drafts over them. */
async function websiteGallery(site = "live") {
  const docs = world.sanity.view(site === "live" ? "published" : "previewDrafts");
  return readVenueDetails(await (await evaluate(parse(VENUE_DETAILS_QUERY), { dataset: docs })).get()).gallery;
}

/** What each photo on the website says it shows, in order. */
const websiteWords = async (site = "live") => (await websiteGallery(site)).map((photo) => photo.alt);

/** Add photos one by one, as the page does; the last is first. Returns the gallery's photos. */
async function addAll(...names) {
  let res;
  for (const name of names) {
    res = await add(name, { description: `The ${name}` });
    assert.equal(res.status, 200, JSON.stringify(res.data));
  }
  return res.data.photos;
}

describe("add: a photo goes in first, and on the website", () => {
  it("has no photos until one is added, and the website shows none", async () => {
    const res = await read();
    assert.equal(res.status, 200);
    assert.deepEqual(res.data.photos, []);
    assert.equal(res.data.website, "none");
    assert.deepEqual(await websiteGallery(), []);
  });

  it("uploads it to Sanity, puts it first, and the website shows it with its words and size", async () => {
    const first = await add("terrace", { description: "The terrace at night" });
    assert.equal(first.status, 200, JSON.stringify(first.data));
    const res = await add("spritz", { description: "  A blue spritz   by the canal ", menu: "drinks" });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.published, true);
    assert.equal(res.data.website, "live");
    assert.deepEqual(res.data.warnings, []);
    assert.equal(res.data.added.length, 1);

    const [spritz, terrace] = res.data.photos;
    assert.equal(spritz.key, res.data.added[0]);
    assert.deepEqual(
      { description: spritz.description, menu: spritz.menu, width: spritz.width, height: spritz.height },
      { description: "A blue spritz by the canal", menu: "drinks", width: 800, height: 600 },
    );
    assert.match(spritz.asset, /^image-[0-9a-f]{40}-800x600-jpg$/);
    assert.match(spritz.url, /^https:\/\/cdn\.sanity\.io\/images\/.+\/production\/[0-9a-f]{40}-800x600\.jpg$/);
    assert.ok(spritz.added);
    assert.equal(terrace.description, "The terrace at night");
    // The photo's only copy is the Sanity asset
    assert.ok(world.sanity.view("raw").some((doc) => doc._id === spritz.asset && doc._type === "sanity.imageAsset"));

    const website = await websiteGallery();
    assert.deepEqual(
      website.map((photo) => [photo.alt, photo.menu ?? "", photo.width, photo.height]),
      [
        ["A blue spritz by the canal", "drinks", 800, 600],
        ["The terrace at night", "", 800, 600],
      ],
    );
    assert.deepEqual(world.sanity.drafts("venueDetails"), []);
    assert.equal((await read()).data.website, "live");
  });

  it("may come with no words yet; the website says none for it until it's described", async () => {
    const res = await add("decks");
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.photos[0].description, "");
    assert.deepEqual(await websiteWords(), [""]);
  });

  it("the same picture again isn't added twice", async () => {
    await add("terrace", { description: "The terrace" });
    const res = await add("terrace", { description: "Again" });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.deepEqual(res.data.added, []);
    assert.deepEqual(
      res.data.photos.map((photo) => photo.description),
      ["The terrace"],
    );
  });

  it("refuses a file that isn't a photo, or words that don't add up, and nothing changes", async () => {
    const notPhoto = await add("notes", { type: "text/plain" });
    assert.equal(notPhoto.status, 400);
    assert.match(notPhoto.data.error, /JPEG, PNG, WebP, or GIF/);
    const long = await add("terrace", { description: "x".repeat(201) });
    assert.equal(long.status, 400);
    assert.match(long.data.error, /^Description: Keep it to a line/);
    const board = await add("terrace", { menu: "bar" });
    assert.equal(board.status, 400);
    assert.deepEqual((await read()).data.photos, []);
    assert.deepEqual(await websiteGallery(), []);
  });
});

describe("describe: what a photo shows, and the board it's pinned on", () => {
  it("changes the words and the board on the website, and nothing else", async () => {
    const [decks, terrace] = await addAll("terrace", "decks");
    const res = await describePhoto(terrace.key, { description: "The terrace at dusk", menu: "food" });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.published, true);
    assert.deepEqual(
      res.data.photos.map((photo) => [photo.key, photo.description, photo.menu]),
      [
        [decks.key, "The decks", ""],
        [terrace.key, "The terrace at dusk", "food"],
      ],
    );
    assert.deepEqual(await websiteWords(), ["The decks", "The terrace at dusk"]);
    assert.equal((await websiteGallery())[1].menu, "food");

    // The board alone, then off it; the words stay
    await describePhoto(terrace.key, { menu: "" });
    const [, after] = (await read()).data.photos;
    assert.deepEqual([after.description, after.menu], ["The terrace at dusk", ""]);
    assert.equal((await websiteGallery())[1].menu, null);
  });

  it("refuses words that don't add up, saying which, and nothing changes", async () => {
    const [terrace] = await addAll("terrace");
    const res = await describePhoto(terrace.key, { description: "x".repeat(201), menu: "bar" });
    assert.equal(res.status, 400);
    assert.deepEqual(Object.keys(res.data.problems).sort(), ["description", "menu"]);
    const nothing = await describePhoto(terrace.key, {});
    assert.equal(nothing.status, 400);
    assert.equal((await read()).data.photos[0].description, "The terrace");
  });

  it("a photo that's gone is a 404 asking for a reload", async () => {
    const res = await describePhoto("gone", { description: "Hello" });
    assert.equal(res.status, 404);
    assert.match(res.data.error, /Reload the page/);
  });
});

describe("reorder: the website shows them in the gallery's order", () => {
  it("puts them in the new order, first first on the website", async () => {
    const photos = await addAll("terrace", "decks", "spritz");
    assert.deepEqual(await websiteWords(), ["The spritz", "The decks", "The terrace"]);
    const [spritz, decks, terrace] = photos;
    const res = await order([terrace.key, spritz.key, decks.key]);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.published, true);
    assert.deepEqual(
      res.data.photos.map((photo) => photo.key),
      [terrace.key, spritz.key, decks.key],
    );
    assert.deepEqual(await websiteWords(), ["The terrace", "The spritz", "The decks"]);

    // A new photo still goes in first
    await add("canal", { description: "The canal" });
    assert.deepEqual(await websiteWords(), ["The canal", "The terrace", "The spritz", "The decks"]);
  });

  it("refuses an order that isn't the whole gallery (the page was out of date), and nothing changes", async () => {
    const [spritz, terrace] = await addAll("terrace", "spritz");
    for (const keys of [[terrace.key], [terrace.key, spritz.key, "other"], [terrace.key, terrace.key]]) {
      const res = await order(keys);
      assert.equal(res.status, 409, JSON.stringify(keys));
      assert.match(res.data.error, /Reload it and try again/);
    }
    const bad = await callApi(world, putOrder, { method: "PUT", path: "/api/venue/gallery", body: {} });
    assert.equal(bad.status, 400);
    assert.deepEqual(await websiteWords(), ["The spritz", "The terrace"]);
  });
});

describe("remove: a photo leaves the website", () => {
  it("takes it out of the gallery and off the website; its Sanity asset stays", async () => {
    const [spritz, terrace] = await addAll("terrace", "spritz");
    const res = await remove(spritz.key);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.published, true);
    assert.deepEqual(
      res.data.photos.map((photo) => photo.key),
      [terrace.key],
    );
    assert.deepEqual(await websiteWords(), ["The terrace"]);
    assert.ok(world.sanity.view("raw").some((doc) => doc._id === spritz.asset));

    // Again: already gone, no change
    const again = await remove(spritz.key);
    assert.equal(again.status, 200);
    assert.equal(again.data.photos.length, 1);
  });

  it("the last one out leaves the website with no venue photos", async () => {
    const [terrace] = await addAll("terrace");
    await remove(terrace.key);
    assert.deepEqual(await websiteGallery(), []);
    const [doc] = world.sanity.view("published").filter((d) => d._id === "venueDetails");
    assert.equal("gallery" in doc, false);
  });
});

describe("publish: the gallery goes on the website with the venue's details", () => {
  const WEEK = [
    { day: "mon", closed: true },
    ...["tue", "wed", "thu", "fri", "sat", "sun"].map((day) => ({ day, opens: "17:00", closes: "22:00" })),
  ];

  it("with website.auto_update off, a change waits on the preview for Update website", async () => {
    world.baserow.insert("Config", { Name: "website.auto_update", Value: "off", Env: "dev", Service: "ops" });
    const res = await add("terrace", { description: "The terrace" });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.published, false);
    assert.equal(res.data.website, "preview");
    assert.deepEqual(await websiteWords("live"), []);
    assert.deepEqual(await websiteWords("preview"), ["The terrace"]);
    assert.equal((await read()).data.website, "preview");

    // Update website on the Website page puts it live
    const published = await callApi(world, updateWebsite, {
      method: "POST",
      path: "/api/web/release",
      body: { confirm: "production" },
    });
    assert.equal(published.status, 200, JSON.stringify(published.data));
    assert.deepEqual(await websiteWords("live"), ["The terrace"]);
    assert.equal((await read()).data.website, "live");
  });

  it("the hours, the party facts and the gallery never drop each other on the way", async () => {
    const hours = await callApi(world, putHours, { method: "PUT", path: "/api/venue/hours", body: { days: WEEK } });
    assert.equal(hours.status, 200, JSON.stringify(hours.data));
    await addAll("terrace");
    const parties = await callApi(world, putParties, {
      method: "PUT",
      path: "/api/venue/parties",
      body: { parties: { seated: "40" } },
    });
    assert.equal(parties.status, 200, JSON.stringify(parties.data));
    assert.equal(parties.data.website, "live");

    const docs = world.sanity.view("published");
    const details = readVenueDetails(await (await evaluate(parse(VENUE_DETAILS_QUERY), { dataset: docs })).get());
    assert.equal(details.openingHours.length, 7);
    assert.equal(details.parties.seated, 40);
    assert.deepEqual(
      details.gallery.map((photo) => photo.alt),
      ["The terrace"],
    );
    assert.equal((await read()).data.website, "live");
  });

  it("when the website can't be reached, the change is still saved in ops, and it says so", async () => {
    const [terrace] = await addAll("terrace");
    world.env.SANITY_API_TOKEN = "";
    const res = await describePhoto(terrace.key, { description: "The terrace at dusk" });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.published, false);
    assert.match(res.data.warnings[0], /^Saved in ops, but the website didn't get it/);
    assert.equal(res.data.photos[0].description, "The terrace at dusk");
    assert.deepEqual(await websiteWords(), ["The terrace"]);
  });
});

describe("from events: the Photos page's events, under the venue's own, read-only", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  /** An event, saved on the Events page. */
  async function event(name) {
    const res = await callApi(world, createEvent, { method: "POST", path: "/api/events", body: { name } });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    return res.data.event;
  }

  /** A photo added on the event's Images tab at `at`; the same name is the same picture as a venue photo's. */
  async function eventPhoto(event, name, at) {
    vi.setSystemTime(new Date(at));
    const body = new FormData();
    body.set("file", photoFile(name));
    const res = await callApi(world, addEventPhoto, {
      method: "POST",
      path: `/api/events/${event.id}/gallery`,
      params: { id: event.id },
      body,
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return res.data.event.gallery[0];
  }

  const summary = (fromEvents) =>
    fromEvents.map((group) => [group.name, group.photos.map((photo) => photo.key), group.more]);

  it("is none until an event has photos", async () => {
    await event("Quiz Night");
    const res = await read();
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.deepEqual(res.data.fromEvents, []);
  });

  it("puts each event's photos under its name, the event with the newest photo first", async () => {
    const karaoke = await event("Karaoke with Ross");
    const friday = await event("Friday, With Guests");
    await event("Quiz Night");
    const mic = await eventPhoto(karaoke, "mic", "2026-11-06T22:00:00Z");
    const crowd = await eventPhoto(karaoke, "crowd", "2026-11-06T23:00:00Z");
    const decks = await eventPhoto(friday, "decks", "2026-11-08T01:00:00Z");

    const res = await read();
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.deepEqual(summary(res.data.fromEvents), [
      ["Friday, With Guests", [decks.key], 0],
      ["Karaoke with Ross", [crowd.key, mic.key], 0],
    ]);
    assert.equal(res.data.fromEvents[0].id, String(friday.id));
    // Each photo from the Sanity CDN, as the event's Images tab shows it
    assert.deepEqual(res.data.fromEvents[0].photos[0], {
      key: decks.key,
      url: decks.url,
      width: decks.width,
      height: decks.height,
      added: "2026-11-08T01:00:00.000Z",
    });
  });

  it("leaves out a picture the venue's photos have, as the Photos page does", async () => {
    const karaoke = await event("Karaoke with Ross");
    const quiz = await event("Quiz Night");
    await eventPhoto(karaoke, "terrace", "2026-11-06T22:00:00Z");
    const crowd = await eventPhoto(karaoke, "crowd", "2026-11-06T21:00:00Z");
    await eventPhoto(quiz, "terrace", "2026-11-09T21:00:00Z");
    await addAll("terrace");

    assert.deepEqual(summary((await read()).data.fromEvents), [["Karaoke with Ross", [crowd.key], 0]]);
  });

  it("shows the newest eight events and each one's newest six, as the Photos page does", async () => {
    const sha = (n) => n.toString(16).padStart(40, "a");
    const photo = (n, added) => ({
      key: `k${n}`,
      asset: `image-${sha(n)}-1600x1200-jpg`,
      url: `https://cdn.sanity.io/images/proj/production/${sha(n)}-1600x1200.jpg`,
      width: 1600,
      height: 1200,
      added,
    });
    const galleries = async () =>
      Array.from({ length: 9 }, (_, i) => ({
        id: String(i + 1),
        name: `Night ${i + 1}`,
        photos: Array.from({ length: i === 8 ? 9 : 1 }, (_, j) =>
          photo(100 * (i + 1) + j, `2026-10-${10 + i}T${String(20 - j).padStart(2, "0")}:00:00Z`),
        ),
      }));
    const fromEvents = await galleryFromEvents(world.env, [], { galleries });
    assert.deepEqual(
      fromEvents.map((group) => [group.name, group.photos.length, group.more]),
      [["Night 9", 6, 3], ...[8, 7, 6, 5, 4, 3, 2].map((n) => [`Night ${n}`, 1, 0])],
    );
  });

  /** Each event as the page shows it: its name, the photos it shows, and how many it left out as too small. */
  const tooSmallSummary = (fromEvents) =>
    fromEvents.map((group) => [group.name, group.photos.map((photo) => photo.key), group.tooSmall]);

  it("says how many of an event's photos it leaves out as too small, as the Photos page does", async () => {
    const karaoke = await event("Karaoke with Ross");
    const crowd = await eventPhoto(karaoke, "crowd", "2026-11-06T21:00:00Z");
    const mic = await eventPhoto(karaoke, "mic-240x240", "2026-11-06T22:00:00Z");
    // The size comes with the photo, from its Sanity asset
    assert.deepEqual([mic.width, mic.height], [240, 240]);

    const res = await read();
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.deepEqual(tooSmallSummary(res.data.fromEvents), [["Karaoke with Ross", [crowd.key], 1]]);
  });

  it("names an event whose photos are all too small, after the ones on the Photos page, with none to show", async () => {
    const karaoke = await event("Karaoke with Ross");
    const pickle = await event("Chez Pickle");
    const crowd = await eventPhoto(karaoke, "crowd", "2026-11-06T21:00:00Z");
    for (const n of [1, 2, 3]) await eventPhoto(pickle, `pickle-${n}-240x240`, `2026-11-10T1${n}:00:00Z`);

    const res = await read();
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.deepEqual(tooSmallSummary(res.data.fromEvents), [
      ["Karaoke with Ross", [crowd.key], 0],
      ["Chez Pickle", [], 3],
    ]);
    assert.equal(res.data.fromEvents[1].id, String(pickle.id));
    assert.equal(res.data.fromEvents[1].more, 0);
  });

  it("doesn't name one too old for the Photos page whatever its size: that's not what left it out", async () => {
    const sha = (n) => n.toString(16).padStart(40, "a");
    const photo = (n, added, size = "1600x1200") => {
      const [width, height] = size.split("x").map(Number);
      return {
        key: `k${n}`,
        asset: `image-${sha(n)}-${size}-jpg`,
        url: `https://cdn.sanity.io/images/proj/production/${sha(n)}-${size}.jpg`,
        width,
        height,
        added,
      };
    };
    const galleries = async () => [
      ...Array.from({ length: 8 }, (_, i) => ({
        id: String(i + 1),
        name: `Night ${i + 1}`,
        photos: [photo(i + 1, `2026-10-${10 + i}T20:00:00Z`)],
      })),
      { id: "20", name: "Old Pickle", photos: [photo(20, "2026-09-01T20:00:00Z", "240x240")] },
      { id: "21", name: "New Pickle", photos: [photo(21, "2026-11-01T20:00:00Z", "240x240")] },
    ];
    const fromEvents = await galleryFromEvents(world.env, [], { galleries });
    assert.deepEqual(
      fromEvents.map((group) => [group.name, group.photos.length, group.tooSmall]),
      [...[8, 7, 6, 5, 4, 3, 2, 1].map((n) => [`Night ${n}`, 1, 0]), ["New Pickle", 0, 1]],
    );
  });
});
