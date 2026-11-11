/**
 * Chez Pickle, the pop-up kitchen, cooks on Thursdays until 26 November
 * 2026. The owner: "for the poppup kithcen, chez pickle, make it a series. it
 * runs until the 26th. add the three (4?) burger pictures to that series",
 * and then "only on Thursdays in November". It was entered as a one-off on
 * Thursday 12 November. This makes it a weekly Thursday series from that
 * night to the 26th (the 12th, 19th and 26th), clears its guest ("KITCHEN
 * POP UP": a pop-up kitchen shows no guest), and adds the three burger
 * photos to its gallery (a frame of the video was left out: it is a flyer,
 * with dates and the address on it). Its name, web address, times,
 * description, card line, link, picture and menu chapter stay.
 *
 * It goes the way ops does it:
 *
 * 1. The schedule and the guest are saved through the editor's own save
 *    (event-store.js updateEvent), which adds the Thursdays' nights. Only
 *    while it is still a one-off on a Thursday; a schedule the owner has
 *    changed since is left as it is and the log says how it is now. Already
 *    Thursdays to the 26th: nothing to do there.
 * 2. Each photo in assets/2026-11-11-chez-pickle/ (JPEGs, in name order) is
 *    added to the series' gallery as the Images tab adds one
 *    (event-store.js addGalleryImage: uploaded to Sanity, kept in ops). A
 *    photo is known by its bytes: Sanity names an image by their SHA-1, so
 *    one whose hash the gallery or the main picture already has is not added
 *    again. To use other files (the originals, say), replace the files in
 *    that folder; nothing here names them.
 * 3. The website then gets it as after any save (website-jobs.js), and
 *    Update website for this event when the setting website.auto_update is
 *    off, since the owner asked for it now (ops-migration.mjs
 *    putEventOnWebsiteNow). Built pages follow with the next automatic
 *    website update.
 *
 * Found by its web address, /whats-on/chez-pickle, which dev and production
 * share; no Chez Pickle stops the deploy with a message saying so. Safe to
 * run again: once it is Thursdays to the 26th with no guest, its photos and
 * the website in step, there is nothing to do, and a run that stopped
 * halfway is finished.
 *
 * --dry-run (with --only) changes nothing anywhere: the save runs on a copy
 * of the data (scripts/lib/d1-rehearsal.mjs), and for the photos and the
 * website it says what would happen, since Sanity has no copy to rehearse on.
 */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { parseImageAssetId } from "../shared/sanity-image.js";
import { recurrenceLabel } from "../ops/site/src/events/server/event-content.js";
import { addGalleryImage, listEvents, updateEvent } from "../ops/site/src/events/server/event-store.js";
import { eventInStepWithWebsite, opsDataForMigration, putEventOnWebsiteNow } from "../scripts/lib/ops-migration.mjs";

export const app = "ops";
export const phase = "post";
export const about = "Events: Chez Pickle runs Thursdays to 26 November, no guest, with its burger photos";

/** /whats-on/chez-pickle */
export const SLUG = "chez-pickle";
/** Its last night. */
export const LAST = "2026-11-26";
/** It cooks on Thursdays. */
export const WEEKDAYS = ["thu"];
/** The gallery photos: every JPEG here, in name order. */
export const PHOTOS = new URL("./assets/2026-11-11-chez-pickle/", import.meta.url);

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekday = (date) => DAY_NAMES[new Date(`${date}T12:00:00Z`).getUTCDay()];
const title = (event) => `"${event.name}" (event ${event.id})`;
const unit = (event) => String(event.repeatUnit || "none").toLowerCase();
const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const span = (event) => [event.startTime, event.endTime].filter(Boolean).join(" to ") || event.time || "no times";
const list = (items) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items[0] || "");
const hashOf = (asset) => parseImageAssetId(asset)?.sha1 || "";

/** The schedule in words: "every Thursday from 2026-11-12 to 2026-11-26", "a one-off on 2026-11-12, a Thursday". */
export function scheduleInWords(event) {
  if (unit(event) === "once") return `a one-off on ${event.startsOn || "no date"}${event.startsOn ? `, a ${weekday(event.startsOn)}` : ""}`;
  const label = recurrenceLabel(event);
  if (!label) return "a series that doesn't repeat";
  const extra = (event.extraDates || []).length ? `, with ${count(event.extraDates.length, "night")} added by hand` : "";
  return `${label[0].toLowerCase()}${label.slice(1)} from ${event.startsOn || "no date"}${event.endsOn ? ` to ${event.endsOn}` : ""}${extra}`;
}

/** Thursdays to the 26th, as the owner wants. */
export function isThursdays(event) {
  return (
    unit(event) === "week" &&
    Math.floor(Number(event.repeatEvery) || 1) === 1 &&
    JSON.stringify(event.weekdays || []) === JSON.stringify(WEEKDAYS) &&
    event.endsOn === LAST
  );
}

/** Still the one-off on a Thursday it was entered as, on or before the 26th. */
export function isThursdayOneOff(event) {
  return unit(event) === "once" && Boolean(event.startsOn) && event.startsOn <= LAST && weekday(event.startsOn) === "Thursday";
}

/** The photos to put in the gallery: { name, bytes, sha1 }, in name order. */
export async function galleryPhotos(dir = PHOTOS) {
  const names = (await readdir(dir)).filter((name) => /\.jpe?g$/i.test(name)).sort();
  if (!names.length) throw new Error(`No photos in ${dir.pathname}: the migration needs its JPEGs.`);
  return Promise.all(
    names.map(async (name) => {
      const bytes = await readFile(new URL(name, dir));
      return { name, bytes, sha1: createHash("sha1").update(bytes).digest("hex") };
    }),
  );
}

/** Chez Pickle by its web address, or a clear error. */
async function findChezPickle(env) {
  const events = await listEvents(env, { withDeleted: true });
  const found =
    events.find((event) => event.slug === SLUG) || events.find((event) => (event.formerSlugs || []).includes(SLUG));
  if (!found) {
    throw new Error(
      `Chez Pickle was not found: no event at /whats-on/${SLUG} (nor one that had that address). Nothing was changed. Check Events in ops, then run this again.`,
    );
  }
  return found;
}

/**
 * Its schedule and guest, through the editor's own save.
 * @returns {Promise<{ event: object, changed: boolean }>}
 */
async function saveScheduleAndGuest(env, event, log, { dryRun }) {
  const would = dryRun ? "would be" : "is now";
  const fields = {};
  const was = scheduleInWords(event);
  if (isThursdayOneOff(event)) {
    // As ops makes a weekly series: repeat every week on Thursdays, to the 26th.
    Object.assign(fields, { repeatUnit: "week", repeatEvery: 1, weekdays: WEEKDAYS, endsOn: LAST });
  } else if (!isThursdays(event)) {
    log(`left alone: the schedule of ${title(event)} is ${was}, not the one-off on a Thursday it was; it was not changed`);
  }
  const guest = String(event.artist || "").trim();
  if (guest) fields.artist = "";
  if (!Object.keys(fields).length) return { event, changed: false };

  const saved = await updateEvent(env, event.id, fields);
  if (fields.repeatUnit) {
    const nights = saved.dates.map((night) => night.date);
    log(`${title(saved)} ${would} ${scheduleInWords(saved)}: ${count(nights.length, "night")}, ${list(nights)}, ${span(saved)}; it was ${was}`);
  }
  if (guest) log(`    its guest "${guest}" ${dryRun ? "would be" : "is"} cleared: a pop-up kitchen shows none`);
  return { event: saved, changed: true };
}

/**
 * The photos the gallery hasn't got, added as the Images tab adds them.
 * @returns {Promise<{ event: object, added: number }>}
 */
async function addPhotos(env, event, log, { dryRun }) {
  const photos = await galleryPhotos();
  const inGallery = new Set(event.gallery.map((photo) => hashOf(photo.asset)));
  const main = hashOf(event.mainImage?.asset);
  const there = photos.filter((photo) => inGallery.has(photo.sha1));
  const isMain = photos.filter((photo) => !inGallery.has(photo.sha1) && photo.sha1 === main);
  const missing = photos.filter((photo) => !inGallery.has(photo.sha1) && photo.sha1 !== main);
  if (there.length) log(`    already in its gallery: ${there.map((photo) => photo.name).join(", ")}`);
  if (isMain.length) log(`    not added, it is its main picture already: ${isMain.map((photo) => photo.name).join(", ")}`);
  if (!missing.length) return { event, added: 0 };

  const names = missing.map((photo) => photo.name).join(", ");
  if (dryRun) {
    log(`    would add ${count(missing.length, "photo")} to its gallery: ${names}`);
    return { event, added: missing.length };
  }
  // The gallery is newest first: the last photo goes in first, so it reads in name order.
  let saved = event;
  for (const photo of [...missing].reverse()) {
    saved = await addGalleryImage(env, event.id, { bytes: photo.bytes, filename: photo.name, contentType: "image/jpeg" });
  }
  log(`    added ${count(missing.length, "photo")} to its gallery: ${names}`);
  return { event: saved, added: missing.length };
}

export async function up({ env, d1, processEnv, log, dryRun = false }) {
  const data = await opsDataForMigration({ env, d1, dryRun, log, processEnv });
  const found = await findChezPickle(data.env);
  if (found.deletedAt) {
    log(`left alone: ${title(found)} is deleted in ops and waits on the Website page; nothing was changed`);
    return;
  }

  const lines = [];
  const say = (line) => lines.push(line);
  const saved = await saveScheduleAndGuest(data.env, found, say, { dryRun });
  const photos = await addPhotos(data.env, saved.event, say, { dryRun });
  const event = photos.event;
  const changed = saved.changed || photos.added > 0;
  if (!changed && eventInStepWithWebsite(event)) {
    // Only what was left alone, if anything: the rest is as the owner wants it.
    for (const line of lines.filter((line) => line.startsWith("left alone"))) log(line);
    const schedule = isThursdays(event) ? scheduleInWords(event) : "as the owner left it";
    log(
      `Nothing to do: ${title(event)} is ${schedule}, with no guest and its ${count(event.gallery.length, "photo")}, and the website is in step.`,
    );
    return;
  }
  for (const line of lines) log(line);
  if (!changed) log(`${title(event)} is as the owner wants it in ops; finishing: putting it on the website`);
  log(`    kept: its name, web address /whats-on/${event.slug}, picture, times, description, card line, link and menu`);
  // A dry run adds no photo (Sanity has no copy to rehearse on): count the ones it would.
  const gallery = event.gallery.length + (dryRun ? photos.added : 0);
  const shows = `${isThursdays(event) ? `every Thursday to ${LAST}` : scheduleInWords(event)}, with ${count(gallery, "photo")} in its gallery`;
  if (dryRun) {
    log(`would put it on the website (/whats-on/${event.slug}): ${shows}`);
    return;
  }
  const live = await putEventOnWebsiteNow(data.env, event.id);
  log(`${title(live)} is on the website: /whats-on/${live.slug}, ${shows}`);
}
