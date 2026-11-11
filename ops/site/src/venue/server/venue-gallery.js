/**
 * The venue's gallery, the use cases (#291): read it, add photos, describe
 * one, put them in order, take one out. Each change then puts the venue's
 * details on the website, the gallery with them, as saving the opening hours
 * does (venue-details.js putDetailsOnWebsite → venue-website.js): the
 * preview at once, the website too unless `website.auto_update` is "off",
 * and built pages with the next automatic website update
 * (website/server/site-pending.js), as for a saved event.
 *
 * Photos are uploaded as an event's gallery photos are (#183): straight to
 * Sanity (platform/image-upload.js), the asset the photo's only copy, which
 * ops keeps the id of. The rules are gallery-model.js's; where the gallery is
 * kept, venue-repository.js's.
 *
 * Reading it also brings the photos from events the website's Photos page
 * shows under the venue's own (galleryFromEvents), to see, not to change:
 * they're managed on each event's Images tab.
 */
import { photosPageEvents } from "../../../../../marketing/web/src/lib/photos.js";
import { parseImageAssetId, sanityImageUrl } from "../../../../../shared/sanity-image.js";
import { listEventGalleries } from "../../events/server/event-galleries.js";
import { uploadImage } from "../../platform/image-upload.js";
import { sanityProjectId } from "../../platform/sanity.js";
import { assertValidPhotoChanges, assertWholeOrder, newPhotoKey } from "../gallery-model.js";
import { byWhom, hasVenueDetails, putDetailsOnWebsite, venueDetailsNow, websiteState } from "./venue-details.js";
import { venueRepository } from "./venue-repository.js";
import { venueOnWebsite } from "./venue-website.js";

function fail(message, status = 400) {
  const error = new Error(message);
  /** @type {any} */ (error).status = status;
  throw error;
}

/**
 * A photo as ops shows it: as kept, plus its address on the Sanity CDN and
 * its size (both from the asset id).
 * @param {import("../gallery-model.js").GalleryPhoto} photo
 */
export function galleryPhotoView(photo, { projectId = "" } = {}) {
  const parsed = parseImageAssetId(photo.asset);
  return {
    ...photo,
    url: sanityImageUrl(projectId, photo.asset),
    width: parsed?.width || 0,
    height: parsed?.height || 0,
  };
}

const views = (env, photos) => photos.map((photo) => galleryPhotoView(photo, { projectId: sanityProjectId(env) }));

/**
 * The gallery, in its order, and where the venue's details stand on the
 * website; and the photos from events the Photos page shows under it
 * (galleryFromEvents).
 */
export async function getGallery(env, { onWebsite = venueOnWebsite, galleries = listEventGalleries } = {}) {
  const now = await venueDetailsNow(venueRepository(env));
  const photos = views(env, now.gallery);
  return {
    photos,
    website: hasVenueDetails(now) ? await websiteState(env, now.details, onWebsite) : "none",
    fromEvents: await galleryFromEvents(env, photos, { galleries }),
  };
}

/** A photo with the hash of its picture, by which the website knows the same one twice. */
const withHash = (photo) => ({ ...photo, hash: parseImageAssetId(photo.asset)?.sha1 || "" });

/**
 * The photos from events the website's Photos page shows under the venue's
 * own, by the website's own rule (marketing/web/src/lib/photos.js
 * photosPageEvents): the newest few events, the one with the newest photo
 * first, each with its newest few (`more`: how many it leaves for the
 * event's page); none too small to show sharp, and none the venue's photos
 * have. Each event's photos come from events (event-galleries.js). The
 * website orders them by when each asset was uploaded, ops by when each
 * photo was added: for a photo added in ops, the same moment.
 *
 * @param {Array<{ asset: string, url: string }>} venuePhotos the venue's gallery (galleryPhotoView)
 * @returns {Promise<Array<{ id: string, name: string, more: number,
 *   photos: Array<{ key: string, url: string, width: number, height: number, added: string }> }>>}
 */
export async function galleryFromEvents(env, venuePhotos, { galleries = listEventGalleries } = {}) {
  const events = (await galleries(env)).map((event) => ({
    id: event.id,
    title: event.name,
    photos: event.photos.map(withHash),
  }));
  return photosPageEvents(venuePhotos.map(withHash), events).map((group) => ({
    id: group.id,
    name: group.title,
    photos: group.photos.map(({ key, url, width, height, added }) => ({ key, url, width, height, added })),
    more: group.more,
  }));
}

/** After a change: the gallery as it is now, and how putting it on the website went. */
async function afterChange(env, repository, deps) {
  const { now, ...result } = await putDetailsOnWebsite(env, repository, deps);
  return { photos: views(env, now.gallery), ...result };
}

/**
 * Add photos at the top of the gallery, in the order given: each is uploaded
 * to Sanity, then all go in at once, then onto the website. A description
 * and a menu board may come with each (both may be blank, and be added
 * later). A photo the gallery has already (the same picture: Sanity names an
 * upload by its bytes) isn't added twice; `added` lists the keys of the ones
 * that went in.
 *
 * @param {{ bytes: ArrayBuffer | Uint8Array, filename: string, contentType: string,
 *   description?: string, menu?: string } | Array<object>} uploads
 */
export async function addGalleryPhotos(
  env,
  uploads,
  { by = "", now = new Date(), upload = uploadImage, ...deps } = {},
) {
  const list = (Array.isArray(uploads) ? uploads : [uploads]).filter(Boolean);
  if (!list.length) fail("Add a photo.");
  // The words are checked before anything is uploaded.
  const words = list.map((item) =>
    assertValidPhotoChanges({ description: item.description ?? "", menu: item.menu ?? "" }),
  );
  const repository = venueRepository(env);
  const photos = [];
  for (const [index, item] of list.entries()) {
    const asset = await upload(env, item);
    photos.push({ key: newPhotoKey(), asset, ...words[index], added: now.toISOString(), addedBy: byWhom(by) });
  }
  const gallery = await repository.addGalleryPhotos(photos);
  const added = photos.map((photo) => photo.key).filter((key) => gallery.some((photo) => photo.key === key));
  return { ...(await afterChange(env, repository, deps)), added };
}

/**
 * Change what a photo says it shows (`description`, the website's alt text)
 * and/or the menu board on home it may be pinned up on (`menu`: "drinks",
 * "food" or "" for neither). 400 naming what's wrong; 404 when the gallery
 * hasn't got the photo (someone else took it out).
 */
export async function describeGalleryPhoto(env, key, changes, deps = {}) {
  const clean = assertValidPhotoChanges({ description: changes?.description, menu: changes?.menu });
  if (!Object.keys(clean).length) fail("Send a description or a menu board.");
  const repository = venueRepository(env);
  const photo = await repository.updateGalleryPhoto(String(key ?? ""), clean);
  if (!photo) fail("That photo isn't in the gallery any more. Reload the page.", 404);
  return afterChange(env, repository, deps);
}

/**
 * Put the gallery in a new order: every photo's key, first first. A list
 * that isn't the whole gallery (the page was out of date) is a 409.
 */
export async function orderGallery(env, keys, deps = {}) {
  const repository = venueRepository(env);
  const current = (await repository.listGallery()).map((photo) => photo.key);
  await repository.orderGallery(assertWholeOrder(current, keys));
  return afterChange(env, repository, deps);
}

/**
 * Take a photo out of the gallery; it leaves the website with the rest of
 * the details. One already gone is no change. The Sanity asset stays: the
 * live site may still show it until its next update.
 */
export async function removeGalleryPhoto(env, key, deps = {}) {
  const repository = venueRepository(env);
  await repository.removeGalleryPhoto(String(key ?? ""));
  return afterChange(env, repository, deps);
}
