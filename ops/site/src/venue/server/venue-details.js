/**
 * Venue details, the use cases (#240): read them, and save the opening
 * hours or the party facts, which also puts the venue's details on the
 * website (venue-website.js). The rules for a valid week are
 * hours-model.js's, for the party facts parties-model.js's; where they are
 * kept, venue-repository.js's. The gallery's use cases (#291) are
 * venue-gallery.js's, and go on the website the same way (putDetailsOnWebsite).
 */
import { assertValidWeek } from "../hours-model.js";
import { assertValidParties } from "../parties-model.js";
import { venueRepository } from "./venue-repository.js";
import { putVenueOnWebsite, venueOnWebsite } from "./venue-website.js";

/** @typedef {"live" | "preview" | "behind" | "none" | "unknown"} WebsiteState */

export async function websiteState(env, details, onWebsite = venueOnWebsite) {
  try {
    return await onWebsite(env, details);
  } catch {
    return "unknown";
  }
}

/**
 * Everything the website shows of the venue, from ops: `details` is what
 * venue-website.js puts there (venueDocument), all of it, so putting it
 * there never drops a part. Migrations put the details there with this too.
 */
export async function venueDetailsNow(repository) {
  const [hours, parties, gallery] = await Promise.all([
    repository.getOpeningHours(),
    repository.getParties(),
    repository.listGallery(),
  ]);
  return { hours, parties, gallery, details: { openingHours: hours?.days ?? null, parties, gallery } };
}

/** True when ops holds anything the website shows. */
export function hasVenueDetails({ hours, parties, gallery }) {
  return Boolean(hours || parties || gallery?.length);
}

/**
 * The venue's details, and where they stand on the website. `openingHours`
 * is null until first saved (the seed migration does that once);
 * `parties` is null until first saved (blank until the venue fills them in).
 */
export async function getVenueDetails(env, { onWebsite = venueOnWebsite } = {}) {
  const now = await venueDetailsNow(venueRepository(env));
  return {
    openingHours: now.hours,
    parties: now.parties,
    website: hasVenueDetails(now) ? await websiteState(env, now.details, onWebsite) : "none",
  };
}

/**
 * Put what ops now holds on the website, after a save: the whole document
 * (venueDetailsNow). A website that can't be reached doesn't undo the save:
 * the warning says so, and saving again tries again. `now` is what was put
 * there.
 */
export async function putDetailsOnWebsite(
  env,
  repository,
  { putOnWebsite = putVenueOnWebsite, onWebsite = venueOnWebsite } = {},
) {
  const now = await venueDetailsNow(repository);
  try {
    const { published, warnings } = await putOnWebsite(env, now.details);
    return { now, website: published ? "live" : "preview", published, warnings };
  } catch (error) {
    return {
      now,
      website: await websiteState(env, now.details, onWebsite),
      published: false,
      warnings: [
        `Saved in ops, but the website didn't get it: ${error?.message || "unknown error"}. Save again to try again.`,
      ],
    };
  }
}

/** After a save of the hours or the party facts: both, and where they stand. */
async function publishDetails(env, repository, deps) {
  const { now, ...result } = await putDetailsOnWebsite(env, repository, deps);
  return { openingHours: now.hours, parties: now.parties, ...result };
}

export const byWhom = (by) =>
  String(by || "")
    .trim()
    .toLowerCase();

/**
 * Save the whole week (400 naming each day that's wrong), then put the
 * venue's details on the website.
 */
export async function saveOpeningHours(
  env,
  days,
  { by = "", now = new Date(), putOnWebsite = putVenueOnWebsite, onWebsite = venueOnWebsite } = {},
) {
  const repository = venueRepository(env);
  const clean = assertValidWeek(days);
  await repository.saveOpeningHours({ days: clean, updatedAt: now.toISOString(), updatedBy: byWhom(by) });
  return publishDetails(env, repository, { putOnWebsite, onWebsite });
}

/**
 * Save the party facts, all of them at once, any of them blank (400 naming
 * each that's wrong), then put the venue's details on the website: the
 * party page shows the ones filled in.
 */
export async function saveParties(
  env,
  input,
  { by = "", now = new Date(), putOnWebsite = putVenueOnWebsite, onWebsite = venueOnWebsite } = {},
) {
  const repository = venueRepository(env);
  const clean = assertValidParties(input);
  await repository.saveParties({ ...clean, updatedAt: now.toISOString(), updatedBy: byWhom(by) });
  return publishDetails(env, repository, { putOnWebsite, onWebsite });
}
