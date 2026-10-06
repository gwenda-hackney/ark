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
import { baserowUserRepository } from "../../../ops/site/src/users/server/adapters/baserow-users.js";
import { d1UserRepository } from "../../../ops/site/src/users/server/adapters/d1-users.js";
import { baserowConfigRepository } from "../../../shared/config-adapters/baserow-config.js";
import { d1ConfigRepository } from "../../../shared/config-adapters/d1-config.js";
import { sameSlot } from "../../../shared/config-model.js";
import { baserowGuests, d1Guests } from "../../../shared/guests/guests-copy.js";
import {
  isSmokeFormSubmission,
  isSmokeSubscriber,
} from "../../../shared/smoke-test.js";
import { baserowArtistRepository } from "../../../shared/artists/baserow-artists.js";
import { isBlankArtist } from "../../../shared/artists/artist-model.js";
import { d1ArtistRepository } from "../../../shared/artists/d1-artists.js";
import { isSmokeSubscriber } from "../../../shared/smoke-test.js";

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
  artists: {
    app: "ops",
    role: "ops",
    freeze: true,
    // Every artist row moves, slot or not (one with no slot may be in the
    // making); only a completely blank row is left out, and named in the log.
    // A guest artist is kept by email, and the deploy smoke test's never is.
    keep: (collection, record) => {
      if (collection !== "artists")
        return Boolean(record.email) && !isSmokeSubscriber(record.email);
      if (!isBlankArtist(record)) return true;
      console.log(`  left out: blank artist row ${record.id}`);
      return false;
    },
    adapters: {
      baserow: ({ env }) => baserowArtistRepository(env),
      d1: ({ db }) => d1ArtistRepository(db),
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
