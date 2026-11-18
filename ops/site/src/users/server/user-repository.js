/**
 * UserRepository (#186): the only way ops reads or writes who may sign in.
 * It speaks in records (user-model.js), never in tables or columns. Every
 * adapter implements all of it, and user-repository.contract.test.js holds
 * them to the same behaviour:
 *
 *   list()               UserRecord[], by id; inactive and blank-email rows included
 *   get(id)              UserRecord, or null when missing
 *   create(fields)       UserRecord ({ name, email, active })
 *   update(id, fields)   UserRecord; only the given fields change. 404 when missing
 *   remove(id)           a missing user is fine
 *   exportAll()          { users: UserRecord[] }, for data-move (#127)
 *   importAll(snapshot)  memory and D1: replace every user, keeping ids
 *
 * Rules (valid emails, no duplicates, names) live in user-store.js.
 * Users live in the ops D1 database (#127).
 */
import { databaseFor } from "../../../../../shared/d1-env.js";
import { d1UserRepository } from "./adapters/d1-users.js";

/** The repository for this runtime. Tests may hand one in as env.usersRepository. */
export function usersRepository(env) {
  return env?.usersRepository || d1UserRepository(databaseFor(env, "ops"));
}
