/**
 * OccasionRepository (#353): the only way ops reads or writes occasions. It
 * speaks in the domain (occasion-model.js), never in tables or columns. Every
 * adapter implements all of it, and occasion-repository.contract.test.js holds
 * them to the same behaviour:
 *
 *   list()                 every Occasion, by id; [] when there are none
 *   get(id)                the Occasion, or null
 *   create(occasion)         adds it (already checked: assertValidOccasion, plus
 *                          updatedAt, updatedBy) and returns it with its id
 *   update(id, occasion)     replaces it whole; returns it, or null when there's no such one
 *   remove(id)             takes it out; no such occasion is no change
 *   exportAll()            { occasions: [...] } with who and when, for a copy
 *   importAll(snapshot)    replace everything with a copy's
 *
 * Born on D1.
 */
import { databaseFor } from "../../../../../shared/d1-env.js";
import { d1OccasionRepository } from "./adapters/d1-occasions.js";

/** The repository for this runtime. Tests may hand one in as env.occasionRepository. */
export function occasionRepository(env) {
  return env?.occasionRepository || d1OccasionRepository(databaseFor(env, "ops"));
}
