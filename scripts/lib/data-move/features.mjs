/**
 * What data-move can move (#127): one entry per feature, added with the
 * feature's D1 adapter.
 *
 *   events: {
 *     app: "ops",                        // whose secrets its Baserow adapter needs
 *     role: "ops",                       // the D1 database it lives in
 *     freeze: true,                      // refuse a production write unless frozen (#191)
 *     keep: (collection, record) => …,   // optional: false for records never copied
 *     adapters: {
 *       baserow: ({ env }) => baserowEventRepository(env),   // a source only
 *       d1: ({ db }) => d1EventRepository(db),
 *     },
 *   }
 */
import { baserowUserRepository } from "../../../ops/site/src/users/server/adapters/baserow-users.js";
import { d1UserRepository } from "../../../ops/site/src/users/server/adapters/d1-users.js";

export const FEATURES = {
  users: {
    app: "ops",
    role: "ops",
    freeze: true,
    // A Users row without an email can't sign in and ops doesn't list it.
    keep: (_collection, user) => Boolean(user.email),
    adapters: {
      baserow: ({ env }) => baserowUserRepository(env),
      d1: ({ db }) => d1UserRepository(db),
    },
  },
};

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
