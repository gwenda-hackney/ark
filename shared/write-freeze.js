/**
 * Write freeze (#191): while a feature's data moves from Baserow to D1
 * (#127), nothing may change it, or the change is lost between the copy and
 * the switch. Reads carry on.
 *
 * The flag lives with the data: a `write_freeze:<feature>` row in `_meta` of
 * the D1 database the feature moves into. Every runtime that writes a feature
 * binds that database, the Workers included, and the flag takes effect on the
 * next request (no config cache). Set and clear it with
 * `npm run d1:freeze -- --env <env> --feature <feature> [--off]`.
 *
 * Fails open: when the database can't be read, writes go ahead (Baserow is
 * still where they land) and the error is logged.
 */
import { D1_BINDINGS } from "./d1-databases.js";

/** Feature → the D1 database role it moves into. */
export const FREEZABLE_FEATURES = {
  events: "ops",
  menu: "ops",
  artists: "ops",
  users: "ops",
  guests: "website",
};

export const FREEZE_KEY_PREFIX = "write_freeze:";

/** What a refused write says, in every app. */
export const FROZEN_MESSAGE =
  "This is read-only for a few minutes while its data moves to the new database. Try again shortly.";

/** 423 Locked: a 4xx, so Cloudflare passes our message through (it replaces some 5xx pages). */
export const FROZEN_STATUS = 423;

function databaseOf(env, feature) {
  const role = FREEZABLE_FEATURES[feature];
  if (!role)
    throw new Error(`Unknown feature "${feature}" for a write freeze.`);
  return env?.[D1_BINDINGS[role]] ?? null;
}

/**
 * The frozen features among `features` (all of them by default), read from
 * the bindings this runtime has. A runtime without a feature's database can't
 * write that feature anyway.
 * @returns {Promise<string[]>}
 */
export async function frozenFeatures(
  env,
  features = Object.keys(FREEZABLE_FEATURES),
) {
  const byDb = new Map();
  for (const feature of features) {
    const db = databaseOf(env, feature);
    if (!db) continue;
    if (!byDb.has(db)) byDb.set(db, []);
    byDb.get(db).push(feature);
  }
  const frozen = [];
  for (const [db, wanted] of byDb) {
    try {
      const { results = [] } = await db
        .prepare("SELECT key FROM _meta WHERE key LIKE ? AND value <> ''")
        .bind(`${FREEZE_KEY_PREFIX}%`)
        .all();
      const keys = new Set(results.map((row) => row.key));
      for (const feature of wanted)
        if (keys.has(FREEZE_KEY_PREFIX + feature)) frozen.push(feature);
    } catch (error) {
      // Before its first migration a database has no _meta, so nothing is frozen.
      if (/no such table/i.test(String(error?.message))) continue;
      console.error(
        "write freeze: could not read _meta; allowing writes.",
        error,
      );
    }
  }
  return frozen;
}

/** A JSON response refusing a write to `features`, or null when none is frozen. */
export async function frozenWriteResponse(env, features) {
  if (!features.length) return null;
  const frozen = await frozenFeatures(env, features);
  if (!frozen.length) return null;
  return new Response(JSON.stringify({ error: FROZEN_MESSAGE, frozen }), {
    status: FROZEN_STATUS,
    headers: { "Content-Type": "application/json", "Retry-After": "120" },
  });
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** True for requests that may change data. */
export function isWriteRequest(request) {
  return WRITE_METHODS.has(String(request.method).toUpperCase());
}

/**
 * The features an API path writes, from a table of [pattern, features].
 * Each app keeps its own table next to its middleware.
 */
export function featuresForPath(pathname, table) {
  const out = new Set();
  for (const [pattern, features] of table) {
    if (pattern.test(pathname))
      for (const feature of features) out.add(feature);
  }
  return [...out];
}
