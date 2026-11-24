/**
 * RoleRepository (#375): the only way ops reads or writes roles. Records are
 * role-model.js's; role-repository.contract.test.js holds every adapter to
 * the same behaviour:
 *
 *   list()               RoleRecord[], by id
 *   get(id)              RoleRecord, or null when missing
 *   create(fields)       RoleRecord
 *   update(id, fields)   RoleRecord; only the given fields change. 404 when missing
 *   remove(id)           a missing role is fine
 *   exportAll()          { roles }; importAll(snapshot) replaces them, keeping ids
 *
 * Rules (the Owner role can't be emptied or removed, names unique) live in
 * role-store.js. Roles live in the ops D1 database.
 */
import { databaseFor } from "../../../../../shared/d1-env.js";
import { d1RoleRepository } from "./adapters/d1-roles.js";

/** The roles the migrations make (db/ops/migrations/0021, 0022): Owner, and Marketing, everyone's by default. */
export const OWNER_ROLE_ID = 1;
export const MARKETING_ROLE_ID = 3;
/** All of What's on, sending email included, and the website. */
export const MARKETING_AREAS = {
  "whats-on": "edit",
  occasions: "edit",
  artists: "edit",
  email: "edit",
  "email-send": "edit",
  photos: "edit",
  website: "edit",
};
export const DEFAULT_ROLES = [
  { id: OWNER_ROLE_ID, name: "Owner", owner: true, isDefault: false, areas: {} },
  { id: MARKETING_ROLE_ID, name: "Marketing", owner: false, isDefault: true, areas: MARKETING_AREAS },
];

/** The repository for this runtime. Tests may hand one in as env.rolesRepository. */
export function rolesRepository(env) {
  return env?.rolesRepository || d1RoleRepository(databaseFor(env, "ops"));
}
