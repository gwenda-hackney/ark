/**
 * The venue's photos move into ops (#291). Until now they were files in the
 * website's code (marketing/web/src/assets/images/), listed in
 * marketing/web/src/data/photos.json; from now on the owner keeps them in
 * ops (Settings → Gallery), and the website reads them from there.
 *
 * It goes the way ops does it:
 *
 * 1. Every photo of the list that is the venue's goes into the Gallery, in
 *    the list's order (the first is first on home), with its words (`alt`)
 *    and its menu board on home (`menu`), as the Gallery adds photos
 *    (venue-gallery.js addGalleryPhotos: each uploaded to Sanity, all kept in
 *    ops at once). The website then gets them as after any change there: the
 *    preview at once, the website too unless `website.auto_update` is "off",
 *    and built pages with the next automatic website update.
 * 2. A photo that is an event's (EVENT_PHOTOS) isn't the venue's: it goes in
 *    that event's gallery instead, as its Images tab adds one (event-store.js
 *    addGalleryImage), and the event goes on the website (ops-migration.mjs
 *    putEventOnWebsiteNow). One marked `already` is in the event's gallery
 *    already and is left out. Should one be in the Gallery (an earlier run,
 *    before it was listed here), it is taken out of it.
 *
 * Only once: a Gallery with photos in it is the venue's own, and is left as
 * the owner has it (step 2 still applies). Adding the photos is one write in
 * ops, so a run that stopped halfway has added none, or all of them; if they
 * aren't on the website yet, they are put there. Photos are known by their
 * bytes: Sanity names an image by their SHA-1. Safe to run again.
 *
 * photos.json and the files stay until this has run in production; then they
 * go, with lib/photos.js listPhotos and addPhoto.
 *
 * --dry-run (with --only) changes nothing anywhere: ops' side runs on a copy
 * of the data (scripts/lib/d1-rehearsal.mjs), and for the photos and the
 * website it says what would happen, since Sanity has no copy to rehearse on.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseImageAssetId } from "../shared/sanity-image.js";
import { addGalleryImage, listEvents } from "../ops/site/src/events/server/event-store.js";
import { putDetailsOnWebsite, venueDetailsNow } from "../ops/site/src/venue/server/venue-details.js";
import { addGalleryPhotos, removeGalleryPhoto } from "../ops/site/src/venue/server/venue-gallery.js";
import { venueOnWebsite } from "../ops/site/src/venue/server/venue-website.js";
import { opsDataForMigration, putEventOnWebsiteNow } from "../scripts/lib/ops-migration.mjs";

export const app = "ops";
export const phase = "post";
export const about = "Gallery: the venue's photos move from the website's files into ops; event photos to their events";

/** The website's list of the venue's photos, before the Gallery, and where their files are. */
export const LIST = new URL("../marketing/web/src/data/photos.json", import.meta.url);
export const FILES = new URL("../marketing/web/src/assets/images/", import.meta.url);

/** Who the Gallery says added them. */
export const ADDED_BY = "migration: venue photos";

/**
 * ===================== EVENT PHOTOS: the owner's list =====================
 *
 * Photos in photos.json that are an event's or a pop-up kitchen's, not the
 * venue's: they don't go in the Gallery. `file` is the photo in photos.json;
 * `event` the event's web address (/whats-on/<event>); `already: true` when
 * the photo is in that event's gallery already, so it is left out rather than
 * added twice. Every other photo of the list is the venue's.
 */
export const EVENT_PHOTOS = [
  // Chez Pickle's burgers: in its gallery already (2026-11-11-chez-pickle-thursdays.mjs).
  { file: "food/chez-pickle-burger.jpg", event: "chez-pickle", already: true },
  { file: "gallery/burger-fresh-off-the-grill.jpg", event: "chez-pickle", already: true },
  { file: "gallery/burger-on-the-griddle.jpg", event: "chez-pickle", already: true },
  // TODO(owner, #291): which event are these from, if any? Until the owner
  // says, they are the venue's and go in the Gallery. Once known, add each
  // here with its event's web address, e.g.
  //   { file: "gallery/focaccia-and-fries.webp", event: "<web address>" },
  // Maybe: gallery/focaccia-and-fries.webp, gallery/decks.webp,
  // gallery/pizza-bread-and-fries.webp, gallery/crocchette.webp.
];
/* ======================================================================= */

const CONTENT_TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const title = (event) => `"${event.name}" (event ${event.id})`;
const hashOf = (asset) => parseImageAssetId(asset)?.sha1 || "";
const board = (menu) => (menu ? `, on the ${menu === "drinks" ? "Drinks" : "Food"} board` : "");

const STATES = {
  live: "the website shows them",
  preview: "the preview shows them, waiting for Update website",
  behind: "the website shows something else",
  none: "the website has none",
  unknown: "the website couldn't be checked",
};

/**
 * The list, read and checked: each photo with its bytes and their SHA-1, and
 * whose it is (`event`: the EVENT_PHOTOS entry, or null for the venue's).
 * A photo listed twice counts once; one whose file is missing stops the run.
 */
export async function planPhotos({ list = LIST, files = FILES, eventPhotos = EVENT_PHOTOS } = {}) {
  const entries = JSON.parse(await readFile(list, "utf8"));
  const events = new Map(eventPhotos.map((entry) => [entry.file, entry]));
  const listed = new Set(entries.map((entry) => String(entry?.file || "").trim()));
  const unknown = eventPhotos.filter((entry) => !listed.has(entry.file)).map((entry) => entry.file);
  if (unknown.length) throw new Error(`EVENT_PHOTOS names photos photos.json hasn't got: ${unknown.join(", ")}.`);
  const seen = new Set();
  const photos = [];
  for (const entry of entries) {
    const file = String(entry?.file || "").trim();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    const ext = file.split(".").pop().toLowerCase();
    const contentType = CONTENT_TYPES[ext];
    if (!contentType) throw new Error(`${file} isn't a photo ops takes (JPEG, PNG, WebP or GIF).`);
    const bytes = await readFile(new URL(file, files)).catch(() => {
      throw new Error(`${file} is in photos.json but not in ${files.pathname}: the migration needs it.`);
    });
    photos.push({
      file,
      description: String(entry.alt || "").trim(),
      menu: ["drinks", "food"].includes(entry.menu) ? entry.menu : "",
      bytes,
      contentType,
      sha1: createHash("sha1").update(bytes).digest("hex"),
      event: events.get(file) || null,
    });
  }
  return {
    venue: photos.filter((photo) => !photo.event),
    events: photos.filter((photo) => photo.event && !photo.event.already),
    already: photos.filter((photo) => photo.event?.already),
  };
}

/** The venue's photos into the Gallery, once. */
async function fillGallery(env, venue, log, { dryRun }) {
  const repository = env.venueRepository;
  const gallery = await repository.listGallery();
  if (gallery.length) {
    log(`left alone: the Gallery has ${count(gallery.length, "photo")} already, the venue's own now`);
    const { details } = await venueDetailsNow(repository);
    const state = await venueOnWebsite(env, details).catch(() => "unknown");
    if (state === "live" || state === "preview") {
      log(`on the website: ${STATES[state]}; nothing to do`);
      return { added: 0, published: false };
    }
    if (dryRun) {
      log(`would put the Gallery on the website (now ${STATES[state]})`);
      return { added: 0, published: false };
    }
    const result = await putDetailsOnWebsite(env, repository);
    return finish(result, log, 0);
  }

  const lines = venue.map((photo, index) => `    ${index + 1}. ${photo.file}: ${photo.description || "(no words)"}${board(photo.menu)}`);
  if (dryRun) {
    log(`would add ${count(venue.length, "photo")} to the Gallery, in this order, and put them on the website:`);
    for (const line of lines) log(line);
    return { added: venue.length, published: false };
  }
  const uploads = venue.map((photo) => ({
    bytes: photo.bytes,
    filename: photo.file.split("/").pop(),
    contentType: photo.contentType,
    description: photo.description,
    menu: photo.menu,
  }));
  const result = await addGalleryPhotos(env, uploads, { by: ADDED_BY });
  log(`added ${count(result.added.length, "photo")} to the Gallery, in this order:`);
  for (const line of lines) log(line);
  return finish(result, log, result.added.length);
}

/** Says where the Gallery stands on the website; throws when it didn't get there. */
function finish(result, log, added) {
  if (result.published) log("put the Gallery on the website; built pages follow with the next automatic website update");
  else if (result.website === "preview") log("put the Gallery on the preview; Update website on the Website page puts it live");
  for (const warning of result.warnings || []) log(`warning: ${warning}`);
  if (!result.published && result.website !== "preview") {
    throw new Error(
      `The Gallery is saved in ops but not on the website: ${(result.warnings || []).join("; ") || "unknown"}. Run again to try again.`,
    );
  }
  return { added, published: result.published };
}

/** An event's photos out of the Gallery, should an earlier run have put them there. */
async function keepEventPhotosOut(env, photos, log, { dryRun }) {
  const byHash = new Map(photos.map((photo) => [photo.sha1, photo]));
  const inGallery = (await env.venueRepository.listGallery()).filter((photo) => byHash.has(hashOf(photo.asset)));
  for (const photo of inGallery) {
    const file = byHash.get(hashOf(photo.asset)).file;
    if (dryRun) {
      log(`would take ${file} out of the Gallery: it is ${byHash.get(hashOf(photo.asset)).event.event}'s`);
      continue;
    }
    const result = await removeGalleryPhoto(env, photo.key);
    log(`took ${file} out of the Gallery: it is ${byHash.get(hashOf(photo.asset)).event.event}'s`);
    finish(result, () => {}, 0);
  }
  return inGallery.length;
}

/** An event by its web address, or a clear error. */
function findEvent(events, slug) {
  const found =
    events.find((event) => event.slug === slug) || events.find((event) => (event.formerSlugs || []).includes(slug));
  if (!found) {
    throw new Error(
      `No event at /whats-on/${slug} (nor one that had that address), named in EVENT_PHOTOS. Nothing more was changed. Check the address in ops, then run this again.`,
    );
  }
  return found;
}

/** Event photos into their events' galleries, as the Images tab adds them. */
async function fillEvents(env, photos, log, { dryRun }) {
  if (!photos.length) return 0;
  const events = await listEvents(env, { withDeleted: true });
  const bySlug = new Map();
  for (const photo of photos) {
    const slug = photo.event.event;
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(photo);
  }
  let added = 0;
  for (const [slug, mine] of bySlug) {
    const event = findEvent(events, slug);
    const inGallery = new Set(event.gallery.map((photo) => hashOf(photo.asset)));
    inGallery.add(hashOf(event.mainImage?.asset));
    const there = mine.filter((photo) => inGallery.has(photo.sha1));
    const missing = mine.filter((photo) => !inGallery.has(photo.sha1));
    if (there.length) log(`    already in ${title(event)}'s gallery: ${there.map((photo) => photo.file).join(", ")}`);
    if (!missing.length) continue;
    const names = missing.map((photo) => photo.file).join(", ");
    if (event.deletedAt) {
      log(`left alone: ${title(event)} is deleted in ops; not added to its gallery: ${names}`);
      continue;
    }
    if (dryRun) {
      log(`would add ${count(missing.length, "photo")} to ${title(event)}'s gallery: ${names}`);
      added += missing.length;
      continue;
    }
    // The gallery is newest first: the last goes in first, so they read in the list's order.
    for (const photo of [...missing].reverse()) {
      await addGalleryImage(env, event.id, {
        bytes: photo.bytes,
        filename: photo.file.split("/").pop(),
        contentType: photo.contentType,
      });
    }
    log(`added ${count(missing.length, "photo")} to ${title(event)}'s gallery: ${names}`);
    const live = await putEventOnWebsiteNow(env, event.id);
    log(`${title(live)} is on the website: /whats-on/${live.slug}`);
    added += missing.length;
  }
  return added;
}

export async function up({ env, d1, processEnv, log, dryRun = false, eventPhotos = EVENT_PHOTOS }) {
  const plan = await planPhotos({ eventPhotos });
  const data = await opsDataForMigration({ env, d1, dryRun, log, processEnv });
  if (plan.already.length) {
    const byEvent = new Map();
    for (const photo of plan.already) byEvent.set(photo.event.event, [...(byEvent.get(photo.event.event) || []), photo.file]);
    for (const [slug, files] of byEvent) {
      log(`left out: ${files.join(", ")}: in the gallery of /whats-on/${slug} already`);
    }
  }
  const removed = await keepEventPhotosOut(data.env, [...plan.events, ...plan.already], log, { dryRun });
  const gallery = await fillGallery(data.env, plan.venue, log, { dryRun });
  const events = await fillEvents(data.env, plan.events, log, { dryRun });
  return { gallery: gallery.added, events, removed, published: gallery.published };
}
