/**
 * VenueRepository (#240): the only way ops reads or writes the venue's
 * details. Today that is the opening hours; the party facts (how many fit,
 * what's included, how fast we reply) join it next, each with its own pair
 * of methods. It speaks in the domain (hours-model.js), never in tables or
 * columns. Every adapter implements all of it, and
 * venue-repository.contract.test.js holds them to the same behaviour:
 *
 *   getOpeningHours()          { days, updatedAt, updatedBy }: seven days, Monday
 *                              first; null when the week was never saved
 *   saveOpeningHours(week)     replaces the whole week ({ days, updatedAt, updatedBy },
 *                              days already checked: hours-model.js assertValidWeek)
 *                              and returns it as getOpeningHours() would
 *   exportAll()                { openingHours: [...] } with who and when, for a copy
 *   importAll(snapshot)        replace everything with a copy's
 *
 * Born on D1: there is no Baserow adapter.
 */
import { databaseFor } from "../../../../../shared/d1-env.js";
import { d1VenueRepository } from "./adapters/d1-venue.js";

/** The repository for this runtime. Tests and migrations may hand one in as env.venueRepository. */
export function venueRepository(env) {
  return env?.venueRepository || d1VenueRepository(databaseFor(env, "ops"));
}
