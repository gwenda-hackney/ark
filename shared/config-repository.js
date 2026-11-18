/**
 * ConfigRepository (#186, #127): the only way config (settings and machine
 * state) reaches storage. It speaks in config records (config-model.js),
 * never in tables or columns. Every adapter implements all of it, and
 * config-repository.contract.test.js holds them to the same behaviour:
 *
 *   list()                          ConfigRecord[]; may be up to CONFIG_CACHE_TTL_MS old
 *   find({ name, env, service })    the exact record, or null; never cached
 *   set({ name, env, service, value })  ConfigRecord; creates or updates the exact record
 *   removeNamed(name)               how many records named `name` went (any env / service)
 *   removeEnv(env)                  how many records of one Env went
 *   exportAll()                     { config_values: ConfigRecord[] }, by id
 *   importAll(snapshot)             replace everything, ids kept
 *
 * Writes clear the adapter's cache, so this runtime reads its own write.
 * Only shared/config.js uses it; everything else reads config through there.
 */
import { databaseFor } from "./d1-env.js";
import { environmentOf } from "./config-model.js";
import { d1ConfigRepository } from "./config-adapters/d1-config.js";

/**
 * The repository for this runtime: the environment's config database in D1.
 * Tests may hand one in as env.configRepository.
 *
 * When the database can't be reached at all (no binding and no Cloudflare
 * token), every call fails with status 503, which callers with a safe
 * default treat as "config unavailable".
 */
export function configRepository(env) {
  if (env?.configRepository) return env.configRepository;
  let db;
  try {
    db = databaseFor(env, "config");
  } catch (error) {
    return unavailable(error);
  }
  // A binding is one handle per runtime, so it keys its own cache. A
  // script's REST handle is new on every call, the database behind it
  // isn't: one cache per environment.
  if (db === env?.CONFIG_DB) return d1ConfigRepository(db);
  return d1ConfigRepository(db, { cacheKey: `config:${environmentOf(env)}` });
}

function unavailable(cause) {
  const fail = async () => {
    const error = new Error(`Config database unavailable: ${cause?.message || cause}`);
    error.status = 503;
    throw error;
  };
  return {
    list: fail,
    find: fail,
    set: fail,
    removeNamed: fail,
    removeEnv: fail,
    exportAll: fail,
    importAll: fail,
  };
}
