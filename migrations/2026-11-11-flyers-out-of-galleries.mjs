/**
 * Flyers out of galleries. An event's gallery is for photos of the night;
 * event gallery photos are about to show in the website's own photo
 * gallery, and a flyer there (dates, prices, an address) reads as an advert.
 * Production has two, and dev the same, copied from it:
 *
 * - The Cocktail Hour's flyer is its main image and was added to its
 *   gallery too, so its page shows the same picture twice. The owner: "the
 *   cocktail hour event has an image in its gallery. its the same as the
 *   main image. delete that image". Every gallery photo that is the same
 *   picture as the main image goes.
 * - Friday, With Guests has Andy Caruso's flyer for 2 October in its
 *   gallery, copied in from its Drive folder; its main image is a photo of
 *   the turntables. That one photo goes, named by its Sanity image.
 *
 * Same picture means the same file: Sanity names an image by the SHA-1 of
 * its bytes (shared/sanity-image.js), so a photo is matched by that hash,
 * never by its place in the gallery or by look. Main images stay.
 *
 * It goes the way ops does it: a photo comes off the gallery as the Images
 * tab takes one off (event-store.js removeGalleryImage; the Sanity asset
 * stays, as a main image or a night may use it), then the website gets it as
 * after any save (website-jobs.js), and Update website for the event when
 * the setting website.auto_update is off, since the owner asked for it now
 * (ops-migration.mjs putEventOnWebsiteNow). Putting an event on the website
 * also takes along anything else of it still waiting there (in production,
 * the Cocktail Hour's new name and days from 2026-11-10-one-happy-hour).
 * Built pages follow with the next automatic website update.
 *
 * Events are found by their web addresses, which dev and production share
 * (their names differ until earlier migrations rename them). One that isn't
 * there stops the deploy with a message naming it, once the others are
 * done. Safe to run again: with no such photo in a gallery, in ops or on the
 * website, there is nothing to do, and a run that stopped halfway is
 * finished.
 *
 * --dry-run (with --only) changes nothing anywhere: the photos come off a
 * copy of the data (scripts/lib/d1-rehearsal.mjs), and for the website it
 * says what would happen, since Sanity has no copy to rehearse on.
 */
import { parseImageAssetId } from "../shared/sanity-image.js";
import { sanitySeriesId } from "../ops/site/src/events/server/event-content.js";
import { listEvents, removeGalleryImage } from "../ops/site/src/events/server/event-store.js";
import { sanityQuery } from "../ops/site/src/platform/sanity.js";
import { opsDataForMigration, putEventOnWebsiteNow } from "../scripts/lib/ops-migration.mjs";

export const app = "ops";
export const phase = "post";
export const about = "Events: flyers out of galleries (the Cocktail Hour's main image; Andy Caruso's on Friday, With Guests)";

/** A gallery photo that is the same picture as the event's main image. */
export const SAME_AS_MAIN_IMAGE = "same as main image";

/**
 * Whose gallery, and which flyer: SAME_AS_MAIN_IMAGE, or one Sanity image
 * (as production has it) and what it is, for the log.
 */
export const GALLERIES = [
  {
    called: "The Cocktail Hour",
    slug: "from-wednesday-to-saturday-is-the-cocktail-hour",
    flyer: SAME_AS_MAIN_IMAGE,
  },
  {
    called: "Friday, With Guests",
    slug: "music-friday",
    flyer: {
      asset: "image-c27f2e8ad4e270a65182ef8aa5f303e31b03a650-1254x1254-png",
      is: "Andy Caruso's flyer for 2 October",
    },
  },
];

const title = (event) => `"${event.name}" (event ${event.id})`;
const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const hashOf = (asset) => parseImageAssetId(asset)?.sha1 || "";

/** The flyer's hash for this event; "" when there is none to look for (no main image). */
function flyerHash(gallery, event) {
  return hashOf(gallery.flyer === SAME_AS_MAIN_IMAGE ? event.mainImage?.asset : gallery.flyer.asset);
}

/** What the flyer is, for the log. */
function flyerWords(gallery) {
  return gallery.flyer === SAME_AS_MAIN_IMAGE
    ? "the same picture as its main image"
    : `${gallery.flyer.is} (${gallery.flyer.asset})`;
}

/** The event's gallery photos that are the flyer. */
export function flyersIn(gallery, event) {
  const hash = flyerHash(gallery, event);
  return hash ? (event.gallery || []).filter((photo) => hashOf(photo.asset) === hash) : [];
}

/** The website still shows the flyer in the event's gallery. */
async function websiteShowsFlyer(env, gallery, event) {
  const hash = flyerHash(gallery, event);
  if (!hash) return false;
  const refs =
    (await sanityQuery(env, "production", "*[_id == $id][0].gallery[].asset._ref", { id: sanitySeriesId(event.slug) })) || [];
  return refs.some((ref) => hashOf(ref) === hash);
}

/** The event by its web address (or one it had), or null. */
function find(events, slug) {
  return events.find((event) => event.slug === slug) || events.find((event) => (event.formerSlugs || []).includes(slug)) || null;
}

/**
 * Take one event's flyer off its gallery, and put the event on the website without it.
 * @returns {Promise<boolean>} whether anything changed or would change
 */
async function flyerOut(env, gallery, event, log, { dryRun }) {
  if (event.deletedAt) {
    log(`left alone: ${title(event)} is deleted in ops and waits on the Website page; nothing was changed`);
    return false;
  }
  const flyers = flyersIn(gallery, event);
  if (!flyers.length && !(await websiteShowsFlyer(env, gallery, event))) {
    log(`Nothing to do: no photo in the gallery of ${title(event)} is ${flyerWords(gallery)}, in ops or on the website.`);
    return false;
  }
  if (!flyers.length) log(`${title(event)}'s gallery in ops is right; finishing: the website still shows ${flyerWords(gallery)} in it`);
  let now = event;
  for (const photo of flyers) {
    now = await removeGalleryImage(env, event.id, photo.key);
    log(
      `${dryRun ? "would take" : "took"} photo ${photo.key} off the gallery of ${title(event)}: it is ${gallery.flyer === SAME_AS_MAIN_IMAGE ? `the same picture as its main image (${photo.asset})` : flyerWords(gallery)}; its main image stays`,
    );
  }
  const left = `${count(now.gallery.length, "photo")} left in its gallery`;
  if (dryRun) {
    log(`would put "${now.name}" on the website without it (/whats-on/${now.slug}), ${left}`);
    return true;
  }
  const live = await putEventOnWebsiteNow(env, event.id);
  if (await websiteShowsFlyer(env, gallery, live)) {
    throw new Error(`The website still shows ${flyerWords(gallery)} in the gallery of ${title(live)}. Run again.`);
  }
  log(`"${live.name}" is on the website without it: /whats-on/${live.slug}, ${left}`);
  return true;
}

export async function up({ env, d1, processEnv, log, dryRun = false }) {
  const data = await opsDataForMigration({ env, d1, dryRun, log, processEnv });
  const events = await listEvents(data.env, { withDeleted: true });
  const missing = [];
  let changed = false;
  for (const gallery of GALLERIES) {
    const event = find(events, gallery.slug);
    if (!event) {
      missing.push(`${gallery.called} was not found: no event at /whats-on/${gallery.slug} (nor one that had that address).`);
      continue;
    }
    if (await flyerOut(data.env, gallery, event, log, { dryRun })) changed = true;
  }
  if (missing.length) {
    throw new Error(
      `${missing.join(" ")} ${changed ? "The others were done." : "Nothing was changed."} Check Events in ops, then run this again.`,
    );
  }
}
