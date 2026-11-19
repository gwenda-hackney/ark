/**
 * Occasions, the use cases (#353): list them, open one, save one (new or
 * changed), take one out, and give one a picture or take it off. Every
 * change puts all the occasions on the website (occasions-website.js); a website
 * that can't be reached doesn't undo the save, it says so. The rules are
 * occasion-model.js's; where they're kept, occasion-repository.js's.
 */
import { nowIso } from "../../../../../shared/d1.js";
import { sanityImageUrl } from "../../../../../shared/sanity-image.js";
import { uploadImage } from "../../platform/image-upload.js";
import { sanityProjectId } from "../../platform/sanity.js";
import { assertValidOccasion, occasion, occasionOrder, occasionState } from "../occasion-model.js";
import { occasionRepository } from "./occasion-repository.js";
import { putOccasionsOnWebsite, occasionsOnWebsite } from "./occasions-website.js";

function notFound() {
  const error = new Error("There's no such occasion.");
  error.status = 404;
  return error;
}

/** London's day, YYYY-MM-DD. */
function londonDay(now) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}

/** An occasion for the page: where it stands today, and its picture's address. */
function forPage(env, value, today) {
  return {
    ...value,
    state: occasionState(value, today),
    imageUrl: value.image ? sanityImageUrl(sanityProjectId(env), value.image.asset, { w: 800 }) : "",
  };
}

async function websiteState(env, occasions, onWebsite) {
  try {
    return await onWebsite(env, occasions);
  } catch {
    return "unknown";
  }
}

/** Every occasion, showing and coming first, and where they stand on the website. */
export async function listOccasions(env, { now = new Date(), onWebsite = occasionsOnWebsite } = {}) {
  const today = londonDay(now);
  const occasions = await occasionRepository(env).list();
  return {
    occasions: occasionOrder(occasions, today).map((item) => forPage(env, item, today)),
    website: occasions.length ? await websiteState(env, occasions, onWebsite) : "none",
  };
}

export async function getOccasion(env, id, { now = new Date() } = {}) {
  const value = await occasionRepository(env).get(id);
  if (!value) throw notFound();
  return { occasion: forPage(env, value, londonDay(now)) };
}

/** Put every occasion on the website, after a change; a failure is a warning. */
async function putOnWebsite(env, repository, { putOnWebsite = putOccasionsOnWebsite, onWebsite = occasionsOnWebsite } = {}) {
  const occasions = await repository.list();
  try {
    const { published, warnings } = await putOnWebsite(env, occasions);
    return { website: published ? "live" : "preview", published, warnings };
  } catch (error) {
    return {
      website: await websiteState(env, occasions, onWebsite),
      published: false,
      warnings: [
        `Saved in ops, but the website didn't get it: ${error?.message || "unknown error"}. Save again to try again.`,
      ],
    };
  }
}

/**
 * Save an occasion: a new one without an id, else the one with it. Its picture
 * is kept as it is (pictures change through setOccasionImage).
 */
export async function saveOccasion(env, raw, { id = null, by = "", now = new Date(), ...deps } = {}) {
  const repository = occasionRepository(env);
  const current = id != null ? await repository.get(id) : null;
  if (id != null && !current) throw notFound();
  const value = {
    ...assertValidOccasion({ ...raw, image: current?.image ?? null }),
    updatedAt: nowIso(now),
    updatedBy: by || "",
  };
  const saved = current ? await repository.update(id, value) : await repository.create(value);
  return { occasion: forPage(env, saved, londonDay(now)), ...(await putOnWebsite(env, repository, deps)) };
}

export async function deleteOccasion(env, id, deps = {}) {
  const repository = occasionRepository(env);
  if (!(await repository.get(id))) throw notFound();
  await repository.remove(id);
  return { ok: true, ...(await putOnWebsite(env, repository, deps)) };
}

/**
 * Give an occasion a picture (uploaded to Sanity), or take it off (`upload`
 * null). The picture's description is `alt`, else the one it had.
 */
export async function setOccasionImage(
  env,
  id,
  file,
  { alt, by = "", now = new Date(), upload = uploadImage, ...deps } = {},
) {
  const repository = occasionRepository(env);
  const current = await repository.get(id);
  if (!current) throw notFound();
  const asset = file ? await upload(env, file) : "";
  const value = occasion({
    ...current,
    image: asset ? { asset, alt: alt ?? current.image?.alt ?? "" } : null,
    updatedAt: nowIso(now),
    updatedBy: by || "",
  });
  const saved = await repository.update(id, { ...value, updatedAt: nowIso(now), updatedBy: by || "" });
  return { occasion: forPage(env, saved, londonDay(now)), ...(await putOnWebsite(env, repository, deps)) };
}
