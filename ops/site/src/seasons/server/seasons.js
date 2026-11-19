/**
 * Seasons, the use cases (#353): list them, open one, save one (new or
 * changed), take one out, and give one a picture or take it off. Every
 * change puts all the seasons on the website (seasons-website.js); a website
 * that can't be reached doesn't undo the save, it says so. The rules are
 * season-model.js's; where they're kept, season-repository.js's.
 */
import { nowIso } from "../../../../../shared/d1.js";
import { sanityImageUrl } from "../../../../../shared/sanity-image.js";
import { uploadImage } from "../../platform/image-upload.js";
import { sanityProjectId } from "../../platform/sanity.js";
import { assertValidSeason, season, seasonOrder, seasonState } from "../season-model.js";
import { seasonRepository } from "./season-repository.js";
import { putSeasonsOnWebsite, seasonsOnWebsite } from "./seasons-website.js";

function notFound() {
  const error = new Error("There's no such season.");
  error.status = 404;
  return error;
}

/** London's day, YYYY-MM-DD. */
function londonDay(now) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}

/** A season for the page: where it stands today, and its picture's address. */
function forPage(env, value, today) {
  return {
    ...value,
    state: seasonState(value, today),
    imageUrl: value.image ? sanityImageUrl(sanityProjectId(env), value.image.asset, { w: 800 }) : "",
  };
}

async function websiteState(env, seasons, onWebsite) {
  try {
    return await onWebsite(env, seasons);
  } catch {
    return "unknown";
  }
}

/** Every season, showing and coming first, and where they stand on the website. */
export async function listSeasons(env, { now = new Date(), onWebsite = seasonsOnWebsite } = {}) {
  const today = londonDay(now);
  const seasons = await seasonRepository(env).list();
  return {
    seasons: seasonOrder(seasons, today).map((item) => forPage(env, item, today)),
    website: seasons.length ? await websiteState(env, seasons, onWebsite) : "none",
  };
}

export async function getSeason(env, id, { now = new Date() } = {}) {
  const value = await seasonRepository(env).get(id);
  if (!value) throw notFound();
  return { season: forPage(env, value, londonDay(now)) };
}

/** Put every season on the website, after a change; a failure is a warning. */
async function putOnWebsite(env, repository, { putOnWebsite = putSeasonsOnWebsite, onWebsite = seasonsOnWebsite } = {}) {
  const seasons = await repository.list();
  try {
    const { published, warnings } = await putOnWebsite(env, seasons);
    return { website: published ? "live" : "preview", published, warnings };
  } catch (error) {
    return {
      website: await websiteState(env, seasons, onWebsite),
      published: false,
      warnings: [
        `Saved in ops, but the website didn't get it: ${error?.message || "unknown error"}. Save again to try again.`,
      ],
    };
  }
}

/**
 * Save a season: a new one without an id, else the one with it. Its picture
 * is kept as it is (pictures change through setSeasonImage).
 */
export async function saveSeason(env, raw, { id = null, by = "", now = new Date(), ...deps } = {}) {
  const repository = seasonRepository(env);
  const current = id != null ? await repository.get(id) : null;
  if (id != null && !current) throw notFound();
  const value = {
    ...assertValidSeason({ ...raw, image: current?.image ?? null }),
    updatedAt: nowIso(now),
    updatedBy: by || "",
  };
  const saved = current ? await repository.update(id, value) : await repository.create(value);
  return { season: forPage(env, saved, londonDay(now)), ...(await putOnWebsite(env, repository, deps)) };
}

export async function deleteSeason(env, id, deps = {}) {
  const repository = seasonRepository(env);
  if (!(await repository.get(id))) throw notFound();
  await repository.remove(id);
  return { ok: true, ...(await putOnWebsite(env, repository, deps)) };
}

/**
 * Give a season a picture (uploaded to Sanity), or take it off (`upload`
 * null). The picture's description is `alt`, else the one it had.
 */
export async function setSeasonImage(
  env,
  id,
  file,
  { alt, by = "", now = new Date(), upload = uploadImage, ...deps } = {},
) {
  const repository = seasonRepository(env);
  const current = await repository.get(id);
  if (!current) throw notFound();
  const asset = file ? await upload(env, file) : "";
  const value = season({
    ...current,
    image: asset ? { asset, alt: alt ?? current.image?.alt ?? "" } : null,
    updatedAt: nowIso(now),
    updatedBy: by || "",
  });
  const saved = await repository.update(id, { ...value, updatedAt: nowIso(now), updatedBy: by || "" });
  return { season: forPage(env, saved, londonDay(now)), ...(await putOnWebsite(env, repository, deps)) };
}
