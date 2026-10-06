/**
 * MenuRepository (#186): the only way the menu and inventory code reads or
 * writes storage. It speaks in records (menu-model.js), one collection per
 * table, never in tables or columns. Every adapter implements all of it, and
 * menu-repository.contract.test.js holds them to the same behaviour:
 *
 *   list(collection, where?)        records by id; `where` filters by links, e.g. { itemId: 7 }
 *   get(collection, id)             a record, or null when missing
 *   create(collection, fields)      the new record
 *   update(collection, id, fields)  the record; only the given fields change. 404 when missing
 *   remove(collection, id)          also what it takes with it (menu-model.js CASCADES);
 *                                   a missing record is fine
 *   write(changes)                  many at once, in order: [{ op: "create", collection, fields },
 *                                   { op: "update", collection, id, fields }, { op: "remove", collection, id }]
 *                                   → each change's record (null for a removal)
 *   exportAll()                     { <collection>: records }, for data-move (#127)
 *   importAll(snapshot)             memory and D1: replace everything, keeping ids
 *
 * Rules (unique names, placements, recipe metrics) live in the stores.
 * Baserow until `store:menu` in ops D1 says d1 (shared/data-store.js).
 */
import { databaseFor } from "../../../../../shared/d1-env.js";
import { switchedRepository } from "../../../../../shared/data-store.js";
import { baserowMenuRepository } from "./adapters/baserow-menu.js";
import { d1MenuRepository } from "./adapters/d1-menu.js";

/** The repository for this runtime. Tests may hand one in as env.menuRepository. */
export function menuRepository(env) {
  return (
    env?.menuRepository ||
    switchedRepository(env, "menu", {
      baserow: (env) => baserowMenuRepository(env),
      d1: (env) => d1MenuRepository(databaseFor(env, "ops")),
    })
  );
}
