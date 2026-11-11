/**
 * What data-move can move (#127): one entry per feature, added with the
 * feature's D1 adapter.
 *
 *   events: {
 *     app: "ops",                        // whose secrets its Baserow adapter needs
 *     role: "ops",                       // the D1 database it lives in
 *     freeze: true,                      // refuse a production write unless frozen (#191)
 *     tables: [...],                     // optional: its D1 tables, parents first, so a D1 source
 *                                        // whose schema is behind this code can still be read
 *     keep: (collection, record, records) => …,   // optional: false for records never copied
 *     detach: (collection, record) => fields,     // optional: what a copy out of production
 *                                        // leaves behind (see leavesProduction below)
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
import { baserowMenuRepository } from "../../../ops/site/src/menu/server/adapters/baserow-menu.js";
import { MENU_D1_TABLES, d1MenuRepository } from "../../../ops/site/src/menu/server/adapters/d1-menu.js";
import { baserowEventRepository } from "../../../ops/site/src/events/server/adapters/baserow-events.js";
import { EVENT_D1_TABLES, d1EventRepository } from "../../../ops/site/src/events/server/adapters/d1-events.js";

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
  // Menu and inventory: sections, POS menus, drinks, placements, stock,
  // recipe lines, suppliers and supplier links. Every record moves. The
  // Baserow export refuses while a drink photo is still a Baserow file: run
  // the photos backfill (migrations/2026-10-06-menu-photos-backfill.mjs) first.
  menu: {
    app: "ops",
    role: "ops",
    freeze: true,
    tables: MENU_D1_TABLES,
    adapters: {
      baserow: ({ env }) => baserowMenuRepository(env),
      d1: ({ db }) => d1MenuRepository(db),
    },
  },
  events: {
    app: "ops",
    role: "ops",
    freeze: true,
    tables: EVENT_D1_TABLES,
    detach: detachEvent,
    adapters: {
      baserow: ({ env }) => baserowEventRepository(env),
      d1: ({ db }) => d1EventRepository(db),
    },
  },
};

/**
 * True for a copy that takes production's records somewhere else (dev). Its
 * target runs with production's Google service account and other shared
 * logins, so an id of something production owns is a way for dev's code to
 * change the real thing. Such a copy applies the feature's `detach`.
 */
export function leavesProduction(from, to) {
  return from?.env === "production" && to?.env !== "production";
}

/**
 * What a series or night leaves behind on a copy out of production:
 * - the series' Drive folder: deleting or renaming the series bins or renames
 *   the folder (event-store.js), and dev would do it to production's. Without
 *   one, ops makes the series its own folder under dev's root when needed.
 * - a gallery photo's Drive original ("drive:<file id>"): the Drive copy
 *   moves the original into the series' folder (event-drive-mirror.js adopt),
 *   so dev would take the file out of production's folder. As "ops", the
 *   photo is copied from Sanity instead.
 * - a night's ClickUp task: task ids work from any list, so dev's social
 *   tasks would rewrite production's. Ops skips ClickUp on dev today
 *   (event-publish.js); this doesn't lean on that.
 *
 * What stays, and why it is safe: a night's Google Calendar entry id (only
 * found on the calendar it is on, and dev's `google.calendar_id` is its own
 * calendar), and Sanity document and image ids here, on the menu and on
 * artists (dev has its own Sanity project, which holds dev's copies under
 * the same ids). The menu's Lightspeed SKUs are only matched against
 * imports; ops never writes to Lightspeed.
 */
export function detachEvent(collection, record) {
  if (collection === "nights") return { clickupTaskId: "" };
  if (collection !== "events") return null;
  return {
    driveFolderId: "",
    gallery: (record.gallery || []).map((photo) =>
      String(photo?.source || "").startsWith("drive:") ? { ...photo, source: "ops" } : photo,
    ),
  };
}

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
