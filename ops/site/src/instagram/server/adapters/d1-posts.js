/**
 * InstagramPostRepository on D1 (#26): the only file that knows the
 * instagram_posts table (db/ops/migrations/0002_instagram_posts.sql).
 * Built on d1Table (db/README.md, "Writing a feature's D1 adapter"); only the
 * in-flight claim and the "still publishing" guard are written by hand.
 */
import { nowIso, run } from "../../../../../../shared/d1.js";
import {
  d1Table,
  exportTables,
  importTables,
} from "../../../../../../shared/d1-table.js";
import { POST_FORMATS, POST_STATUS } from "../post-model.js";

export const instagramPosts = d1Table({
  table: "instagram_posts",
  columns: {
    id: "int",
    eventId: "int",
    nightOn: "date",
    format: "text",
    caption: "text",
    imageAsset: "text",
    imageUrl: "text",
    status: "text",
    containerId: "text",
    mediaId: "text",
    permalink: "text",
    postedBy: "text",
    lastError: "text",
    createdAt: "text",
    sentAt: "text",
  },
  orderBy: "id DESC",
});

/** A table record → the domain's post: string ids, "" for empty. */
function toPost(record) {
  if (!record) return null;
  const out = {};
  for (const [key, value] of Object.entries(record))
    out[key] = value == null ? "" : String(value);
  out.format ||= POST_FORMATS.feed;
  return out;
}

/** Columns that are NOT NULL DEFAULT '': empty stays "", never NULL. */
const NEVER_NULL = new Set(["caption", "postedBy", "lastError"]);

/** The domain's post → table fields: numeric ids, NULL for empty. */
function toFields(post) {
  const out = {};
  for (const [key, value] of Object.entries(post)) {
    out[key] = value === "" && !NEVER_NULL.has(key) ? null : value;
  }
  if (post.id != null && post.id !== "") out.id = Number(post.id);
  if ("eventId" in post) out.eventId = eventKey(post.eventId);
  return out;
}

function eventKey(eventId) {
  const id = Number(eventId);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error(`Not an event id: ${eventId}`);
    error.status = 400;
    throw error;
  }
  return id;
}

function conflict(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

const isInFlightClash = (error) =>
  /UNIQUE constraint failed/i.test(String(error?.message || error));

export function d1PostRepository(db) {
  const get = async (id) => toPost(await instagramPosts.get(db, id));

  /** Changes a post that is still publishing; explains why when it isn't. */
  async function settle(id, fields) {
    // Like patchStatement, but only a post still in flight may change.
    const { id: _id, ...row } = instagramPosts.toRow(toFields(fields));
    const cols = Object.keys(row);
    const meta = await run(
      db,
      `UPDATE ${instagramPosts.table} SET ${cols.map((col) => `${col} = ?`).join(", ")} WHERE id = ? AND status = ?`,
      [...cols.map((col) => row[col]), Number(id), POST_STATUS.publishing],
    );
    const post = await get(id);
    if (!post) {
      const error = new Error("Post not found.");
      error.status = 404;
      throw error;
    }
    if (!meta.changes) {
      throw conflict(
        post.status === POST_STATUS.sent
          ? "This post was already sent."
          : "This post is no longer being published.",
      );
    }
    return post;
  }

  return {
    async listFor(eventId, nightOn) {
      const params = [eventKey(eventId)];
      let where = "event_id = ?";
      if (nightOn !== undefined) {
        where += " AND IFNULL(night_on, '') = ?";
        params.push(nightOn || "");
      }
      return (await instagramPosts.list(db, { where, params })).map(toPost);
    },

    get,

    async start(post) {
      const fields = toFields({
        ...post,
        format: post.format || POST_FORMATS.feed,
        status: POST_STATUS.publishing,
        caption: post.caption || "",
        postedBy: post.postedBy || "",
        lastError: "",
        createdAt: post.createdAt || nowIso(),
      });
      delete fields.id;
      const row = instagramPosts.toRow(fields);
      const cols = Object.keys(row);
      const nightOn = post.nightOn || "";
      try {
        // Not while this night has a post in flight; the unique index
        // instagram_posts_in_flight catches two requests at the same moment.
        const meta = await run(
          db,
          `INSERT INTO ${instagramPosts.table} (${cols.join(", ")})
           SELECT ${cols.map(() => "?").join(", ")}
           WHERE NOT EXISTS (
             SELECT 1 FROM ${instagramPosts.table} WHERE event_id = ? AND IFNULL(night_on, '') = ? AND status = ?
           )`,
          [
            ...cols.map((col) => row[col]),
            row.event_id,
            nightOn,
            POST_STATUS.publishing,
          ],
        );
        if (!meta.changes) return null;
        return get(meta.last_row_id);
      } catch (error) {
        if (isInFlightClash(error)) return null;
        throw error;
      }
    },

    async finish(id, fields) {
      return settle(id, {
        status: POST_STATUS.sent,
        mediaId: String(fields.mediaId || ""),
        permalink: fields.permalink || "",
        sentAt: fields.sentAt || nowIso(),
        lastError: "",
      });
    },

    async fail(id, error) {
      return settle(id, {
        status: POST_STATUS.failed,
        lastError: String(error || "Something went wrong.").slice(0, 500),
      });
    },

    /** Every post, ids kept: what a copy carries (db/README.md). */
    async exportAll() {
      const snapshot = await exportTables(db, [instagramPosts]);
      return {
        [instagramPosts.table]: snapshot[instagramPosts.table].map(toPost),
      };
    },

    /** Replace every post with a snapshot from exportAll. */
    async importAll(snapshot) {
      const posts = snapshot?.[instagramPosts.table] ?? [];
      await importTables(db, [[instagramPosts, posts.map(toFields)]]);
    },
  };
}
