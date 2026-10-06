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
import { baserowGuests, d1Guests } from "../../../shared/guests/guests-copy.js";
import {
  isSmokeFormSubmission,
  isSmokeSubscriber,
} from "../../../shared/smoke-test.js";

export const FEATURES = {
  // Subscribers and form submissions (Website database), one store:guests flag.
  guests: {
    app: "web",
    role: "website",
    freeze: true,
    keep: (collection, record) =>
      collection === "subscribers"
        ? !isSmokeSubscriber(record.email)
        : !isSmokeFormSubmission(record),
    adapters: {
      baserow: ({ env }) => baserowGuests(env),
      d1: ({ db }) => d1Guests(db),
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
