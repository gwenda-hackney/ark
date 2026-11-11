/**
 * Venue details, the use cases (#240): read them, and save the opening
 * hours, which also puts them on the website (venue-website.js). The rules
 * for a valid week are hours-model.js's; where it is kept,
 * venue-repository.js's.
 */
import { assertValidWeek } from "../hours-model.js";
import { venueRepository } from "./venue-repository.js";
import { putVenueOnWebsite, venueOnWebsite } from "./venue-website.js";

/** @typedef {"live" | "preview" | "behind" | "none" | "unknown"} WebsiteState */

async function websiteState(env, details, onWebsite) {
  try {
    return await onWebsite(env, details);
  } catch {
    return "unknown";
  }
}

/** Everything the website shows of the venue, from ops. */
async function currentDetails(repository) {
  const hours = await repository.getOpeningHours();
  return { hours, details: { openingHours: hours?.days ?? null } };
}

/**
 * The venue's details, and where they stand on the website. `openingHours`
 * is null until first saved (the seed migration does that once).
 */
export async function getVenueDetails(env, { onWebsite = venueOnWebsite } = {}) {
  const { hours, details } = await currentDetails(venueRepository(env));
  return {
    openingHours: hours,
    website: hours ? await websiteState(env, details, onWebsite) : "none",
  };
}

/**
 * Save the whole week (400 naming each day that's wrong), then put the
 * venue's details on the website. A website that can't be reached doesn't
 * undo the save: the warning says so, and saving again tries again.
 */
export async function saveOpeningHours(
  env,
  days,
  { by = "", now = new Date(), putOnWebsite = putVenueOnWebsite, onWebsite = venueOnWebsite } = {},
) {
  const repository = venueRepository(env);
  const clean = assertValidWeek(days);
  await repository.saveOpeningHours({
    days: clean,
    updatedAt: now.toISOString(),
    updatedBy: String(by || "").trim().toLowerCase(),
  });
  const { hours, details } = await currentDetails(repository);
  try {
    const { published, warnings } = await putOnWebsite(env, details);
    return { openingHours: hours, website: published ? "live" : "preview", published, warnings };
  } catch (error) {
    return {
      openingHours: hours,
      website: await websiteState(env, details, onWebsite),
      published: false,
      warnings: [
        `Saved in ops, but the website didn't get it: ${error?.message || "unknown error"}. Save again to try again.`,
      ],
    };
  }
}
