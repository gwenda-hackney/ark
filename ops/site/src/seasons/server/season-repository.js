/**
 * SeasonRepository (#353): the only way ops reads or writes seasons. It
 * speaks in the domain (season-model.js), never in tables or columns. Every
 * adapter implements all of it, and season-repository.contract.test.js holds
 * them to the same behaviour:
 *
 *   list()                 every Season, by id; [] when there are none
 *   get(id)                the Season, or null
 *   create(season)         adds it (already checked: assertValidSeason, plus
 *                          updatedAt, updatedBy) and returns it with its id
 *   update(id, season)     replaces it whole; returns it, or null when there's no such one
 *   remove(id)             takes it out; no such season is no change
 *   exportAll()            { seasons: [...] } with who and when, for a copy
 *   importAll(snapshot)    replace everything with a copy's
 *
 * Born on D1.
 */
import { databaseFor } from "../../../../../shared/d1-env.js";
import { d1SeasonRepository } from "./adapters/d1-seasons.js";

/** The repository for this runtime. Tests may hand one in as env.seasonRepository. */
export function seasonRepository(env) {
  return env?.seasonRepository || d1SeasonRepository(databaseFor(env, "ops"));
}
