/**
 * The Cocktail Hour's flyer is in its gallery as well as being its main
 * image, so its page shows the same picture twice. The owner: "i think in
 * prod the cocktail hour event has an image in its gallery. its the same as
 * the main image. delete that image". Production has one such photo (and
 * dev the same, copied from it). This takes off the gallery every photo
 * that is the same picture as the main image, and the main image stays.
 *
 * Same picture means the same file: Sanity names an image by the SHA-1 of
 * its bytes (shared/sanity-image.js), so the gallery photo and the main
 * image share that hash. Not by place in the gallery, and not by look.
 *
 * It goes the way ops does it: the photo comes off the gallery as the Images
 * tab takes one off (event-store.js removeGalleryImage; the Sanity asset
 * stays, as the main image uses it), then the website gets it as after any
 * save (website-jobs.js), and Update website for this event when the setting
 * website.auto_update is off, since the owner asked for it now
 * (ops-migration.mjs putEventOnWebsiteNow). Putting the Cocktail Hour on the
 * website also takes along anything else of it still waiting there. Built
 * pages follow with the next automatic website update.
 *
 * Found by its web address,
 * /whats-on/from-wednesday-to-saturday-is-the-cocktail-hour, which dev and
 * production share (its name differs: production still has the long one
 * until 2026-11-10-one-happy-hour renames it); no Cocktail Hour stops the
 * deploy with a message saying so. Safe to run again: with no such photo in
 * the gallery in ops or on the website there is nothing to do, and a run
 * that stopped halfway is finished.
 *
 * --dry-run (with --only) changes nothing anywhere: the photo comes off a
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
export const about = "Events: the Cocktail Hour's gallery loses the photo that is its main image";

/** /whats-on/from-wednesday-to-saturday-is-the-cocktail-hour */
export const SLUG = "from-wednesday-to-saturday-is-the-cocktail-hour";

const title = (event) => `"${event.name}" (event ${event.id})`;
const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const hashOf = (asset) => parseImageAssetId(asset)?.sha1 || "";

/** The Cocktail Hour by its web address, or a clear error. */
async function findCocktailHour(env) {
  const events = await listEvents(env, { withDeleted: true });
  const found =
    events.find((event) => event.slug === SLUG) || events.find((event) => (event.formerSlugs || []).includes(SLUG));
  if (!found) {
    throw new Error(
      `The Cocktail Hour was not found: no event at /whats-on/${SLUG} (nor one that had that address). Nothing was changed. Check Events in ops, then run this again.`,
    );
  }
  return found;
}

/** Gallery photos that are the same picture as the main image. */
export function photosLikeMainImage(event) {
  const main = hashOf(event.mainImage?.asset);
  return main ? (event.gallery || []).filter((photo) => hashOf(photo.asset) === main) : [];
}

/** The website still shows the main image in the series' gallery. */
async function websiteShowsIt(env, event) {
  const main = hashOf(event.mainImage?.asset);
  if (!main) return false;
  const refs = (await sanityQuery(env, "production", "*[_id == $id][0].gallery[].asset._ref", { id: sanitySeriesId(event.slug) })) || [];
  return refs.some((ref) => hashOf(ref) === main);
}

export async function up({ env, d1, processEnv, log, dryRun = false }) {
  const data = await opsDataForMigration({ env, d1, dryRun, log, processEnv });
  let event = await findCocktailHour(data.env);
  if (event.deletedAt) {
    log(`left alone: ${title(event)} is deleted in ops and waits on the Website page; nothing was changed`);
    return;
  }

  const doubles = photosLikeMainImage(event);
  if (!doubles.length && !(await websiteShowsIt(data.env, event))) {
    log(`Nothing to do: no photo in the gallery of ${title(event)} is its main image, in ops or on the website.`);
    return;
  }
  if (!doubles.length) log(`${title(event)}'s gallery in ops is right; finishing: the website still shows its main image in the gallery`);
  for (const photo of doubles) {
    event = await removeGalleryImage(data.env, event.id, photo.key);
    log(
      `${dryRun ? "would take" : "took"} photo ${photo.key} off the gallery of ${title(event)}: it is the same picture as its main image (${event.mainImage.asset}), which stays`,
    );
  }
  const left = count(event.gallery.length, "photo");
  if (dryRun) {
    log(`would put it on the website without it (/whats-on/${event.slug}), ${left} left in its gallery`);
    return;
  }
  const live = await putEventOnWebsiteNow(data.env, event.id);
  if (await websiteShowsIt(data.env, live)) {
    throw new Error(`The website still shows the main image of ${title(live)} in its gallery. Run again.`);
  }
  log(`"${live.name}" is on the website without it: /whats-on/${live.slug}, ${left} left in its gallery`);
}
