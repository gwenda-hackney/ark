/**
 * What data-move can move (#127): one entry per feature, added with the
 * feature's D1 adapter.
 *
 *   events: {
 *     app: "ops",                        // whose secrets its Baserow adapter needs
 *     role: "ops",                       // the D1 database it lives in
 *     freeze: true,                      // refuse a production write unless frozen (#191)
 *     keep: (collection, record, records) => …,   // optional: false for records never copied
 *     adapters: {
 *       baserow: ({ env }) => baserowEventRepository(env),   // a source only
 *       d1: ({ db }) => d1EventRepository(db),
 *     },
 *   }
 */
import { baserowConfigRepository } from "../../../shared/config-adapters/baserow-config.js";
import { d1ConfigRepository } from "../../../shared/config-adapters/d1-config.js";
import { sameSlot } from "../../../shared/config-model.js";

export const FEATURES = {
  // Settings and machine state. It can't be frozen (shared/write-freeze.js):
  // code rewrites its state on the next run, and a setting saved in ops
  // during the move (pour targets) is saved again after it.
  config: {
    app: "ops",
    role: "config",
    freeze: false,
    keep: firstOfEachSlot,
    adapters: {
      baserow: ({ env }) => baserowConfigRepository(env),
      d1: ({ db }) => d1ConfigRepository(db),
    },
  },
};

/**
 * Baserow can hold two config rows for one name + env + service (its set
 * finds, then creates). D1 has a unique key there, so only the first, by id,
 * moves: the one config.js reads and updates. The rest were never read.
 */
export function firstOfEachSlot(_collection, record, records) {
  return records.find((other) => sameSlot(other, record))?.id === record.id;
}

export function featureFor(name, features = FEATURES) {
  const feature = features[name];
  if (!feature) {
    const known = Object.keys(features);
    throw new Error(
      `Unknown feature "${name}". ${known.length ? `Known: ${known.join(", ")}.` : "None can move yet."}`,
    );
  }
  return feature;
}
