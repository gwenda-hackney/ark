/**
 * Venue details, the use cases (#240): read them, and save the opening
 * hours or the party facts, which also puts the venue's details on the
 * website (venue-website.js). The rules for a valid week are
 * hours-model.js's, for the party facts parties-model.js's; where they are
 * kept, venue-repository.js's.
 */
import { assertValidWeek } from "../hours-model.js";
import { assertValidParties } from "../parties-model.js";
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
  const [hours, parties] = await Promise.all([repository.getOpeningHours(), repository.getParties()]);
  return { hours, parties, details: { openingHours: hours?.days ?? null, parties } };
}

/**
 * The venue's details, and where they stand on the website. `openingHours`
 * is null until first saved (the seed migration does that once);
 * `parties` is null until first saved (blank until the venue fills them in).
 */
export async function getVenueDetails(env, { onWebsite = venueOnWebsite } = {}) {
  const { hours, parties, details } = await currentDetails(venueRepository(env));
  return {
    openingHours: hours,
    parties,
    website: hours || parties ? await websiteState(env, details, onWebsite) : "none",
  };
}

/**
 * Put what ops now holds on the website, after a save. A website that can't
 * be reached doesn't undo the save: the warning says so, and saving again
 * tries again.
 */
async function publishDetails(env, repository, { putOnWebsite, onWebsite }) {
  const { hours, parties, details } = await currentDetails(repository);
  const saved = { openingHours: hours, parties };
  try {
    const { published, warnings } = await putOnWebsite(env, details);
    return { ...saved, website: published ? "live" : "preview", published, warnings };
  } catch (error) {
    return {
      ...saved,
      website: await websiteState(env, details, onWebsite),
      published: false,
      warnings: [
        `Saved in ops, but the website didn't get it: ${error?.message || "unknown error"}. Save again to try again.`,
      ],
    };
  }
}

const byWhom = (by) =>
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
