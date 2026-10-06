/**
 * Where a feature's data lives right now: Baserow or D1 (#127). The cutover
 * is this flag, not a deploy: a `store:<feature>` row in `_meta` of the D1
 * database the feature moves into, read by every runtime on its next request.
 * Set it with `npm run d1:store -- --env <env> --feature <f> --to d1`, after
 * `npm run data:move -- … --write`; back with `--to baserow`.
 *
 * Until the row says d1, a feature stays on Baserow, also where D1 can't be
 * reached at all (no binding and no Cloudflare token: tests, some scripts).
 * Once it can be reached, a failed read throws: guessing Baserow after the
 * cutover would serve stale data and lose writes.
 */
import { first } from "./d1.js";
import { databaseFor } from "./d1-env.js";
import { FREEZABLE_FEATURES } from "./write-freeze.js";

/** Feature → the D1 database role it moves into. Config has no freeze (machine state). */
export const STORE_FEATURES = { ...FREEZABLE_FEATURES, config: "config" };

export const STORE_KEY_PREFIX = "store:";
export const STORES = ["baserow", "d1"];

/**
 * How long a runtime keeps a flag it read. Repositories are built per call,
 * so without this every call would read _meta (D1's free plan allows 50
 * queries per request). A switch happens while the feature is frozen, so a
 * few seconds of the old value can't lose a write.
 */
export const STORE_CACHE_MS = 5000;
const cache = new WeakMap(); // env → Map(feature → { at, value: Promise })

/** @returns {Promise<"baserow" | "d1">} */
export function storeOf(env, feature, { now = Date.now() } = {}) {
  if (!env || typeof env !== "object") return readStore(env, feature);
  let perEnv = cache.get(env);
  if (!perEnv) cache.set(env, (perEnv = new Map()));
  const hit = perEnv.get(feature);
  if (hit && now - hit.at < STORE_CACHE_MS) return hit.value;
  const value = readStore(env, feature);
  perEnv.set(feature, { at: now, value });
  value.catch(() => perEnv.delete(feature)); // a failed read isn't kept
  return value;
}

async function readStore(env, feature) {
  const role = STORE_FEATURES[feature];
  if (!role) throw new Error(`Unknown feature "${feature}" for a data store.`);
  // Tests and local runs can pin a store: DATA_STORE_USERS=d1.
  const pinned = String(
    env?.[`DATA_STORE_${feature.toUpperCase()}`] || "",
  ).trim();
  if (pinned) {
    if (!STORES.includes(pinned))
      throw new Error(
        `DATA_STORE_${feature.toUpperCase()} must be baserow or d1.`,
      );
    return pinned;
  }
  let db;
  try {
    db = databaseFor(env, role);
  } catch {
    return "baserow";
  }
  try {
    const row = await first(db, "SELECT value FROM _meta WHERE key = ?", [
      STORE_KEY_PREFIX + feature,
    ]);
    return row?.value === "d1" ? "d1" : "baserow";
  } catch (error) {
    if (/no such table/i.test(String(error?.message))) return "baserow";
    throw new Error(
      `Can't tell where ${feature} lives (D1 _meta): ${error?.message || error}`,
    );
  }
}

/**
 * A repository that goes to whichever adapter holds the feature, decided once
 * per repository (one request) on its first call.
 *   switchedRepository(env, "users", { baserow: baserowUsers, d1: (env) => d1Users(databaseFor(env, "ops")) })
 */
export function switchedRepository(env, feature, adapters) {
  let chosen = null;
  const pick = () =>
    (chosen ??= storeOf(env, feature).then((store) => adapters[store](env)));
  return new Proxy(
    {},
    {
      get(_target, name) {
        if (name === "then") return undefined; // not a promise
        return async (...args) => {
          const repo = await pick();
          if (typeof repo[name] !== "function")
            throw new Error(`${feature} repository has no ${String(name)}().`);
          return repo[name](...args);
        };
      },
    },
  );
}
