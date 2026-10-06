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
 * Baserow until `store:users` in ops D1 says d1 (shared/data-store.js).
 */
import { databaseFor } from "../../../../../shared/d1-env.js";
import { switchedRepository } from "../../../../../shared/data-store.js";
import { baserowUserRepository } from "./adapters/baserow-users.js";
import { d1UserRepository } from "./adapters/d1-users.js";

/** The repository for this runtime. Tests may hand one in as env.usersRepository. */
export function usersRepository(env) {
  return (
    env?.usersRepository ||
    switchedRepository(env, "users", {
      baserow: (env) => baserowUserRepository(env),
      d1: (env) => d1UserRepository(databaseFor(env, "ops")),
    })
  );
}
