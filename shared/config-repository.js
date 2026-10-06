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
 *   importAll(snapshot)             memory and D1: replace everything, ids kept
 *
 * Writes clear the adapter's cache, so this runtime reads its own write.
 * Only shared/config.js uses it; everything else reads config through there.
 */
import { switchedRepository } from "./data-store.js";
import { databaseFor } from "./d1-env.js";
import { environmentOf } from "./config-model.js";
import { baserowConfigRepository } from "./config-adapters/baserow-config.js";
import { d1ConfigRepository } from "./config-adapters/d1-config.js";

/**
 * The repository for this runtime: Baserow or D1, whichever `store:config`
 * in _meta names (shared/data-store.js). Tests may hand one in as
 * env.configRepository.
 */
export function configRepository(env) {
  if (env?.configRepository) return env.configRepository;
  return switchedRepository(env, "config", {
    baserow: (env) => baserowConfigRepository(env),
    // One cache per environment, binding or REST alike: a script's REST
    // handle is new on every call, the database behind it isn't.
    d1: (env) =>
      d1ConfigRepository(databaseFor(env, "config"), {
        cacheKey: `config:${environmentOf(env)}`,
      }),
  });
}
