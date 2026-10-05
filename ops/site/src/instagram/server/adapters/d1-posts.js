/**
 * InstagramPostRepository on D1 (#26): the only file that knows the
 * instagram_posts table (db/ops/migrations/0002_instagram_posts.sql).
 */
import { all, first, identifier, nowIso, run } from "../../../../../../shared/d1.js";
import { POST_FORMATS, POST_STATUS } from "../post-model.js";

const TABLE = "instagram_posts";

/** Record key → column, for patches. */
const COLUMNS = {
  status: "status",
  mediaId: "media_id",
  permalink: "permalink",
  sentAt: "sent_at",
  lastError: "last_error",
  containerId: "container_id",
};

function fromRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    nightOn: row.night_on || "",
    format: row.format || POST_FORMATS.feed,
    caption: row.caption || "",
    imageAsset: row.image_asset || "",
    imageUrl: row.image_url || "",
    status: row.status,
    containerId: row.container_id || "",
    mediaId: row.media_id || "",
    permalink: row.permalink || "",
    postedBy: row.posted_by || "",
    lastError: row.last_error || "",
    createdAt: row.created_at || "",
    sentAt: row.sent_at || "",
  };
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

const isInFlightClash = (error) => /UNIQUE constraint failed/i.test(String(error?.message || error));

export function d1PostRepository(db) {
  const get = async (id) => fromRow(await first(db, `SELECT * FROM ${TABLE} WHERE id = ?`, [Number(id)]));

  /** Changes a post that is still publishing; explains why when it isn't. */
  async function settle(id, patch) {
    // Like patchStatement, but only a post still in flight may change.
    const sets = Object.entries(COLUMNS).filter(([key]) => key in patch);
    const sql = `UPDATE ${TABLE} SET ${sets.map(([, column]) => `${identifier(column)} = ?`).join(", ")} WHERE id = ? AND status = ?`;
    const meta = await run(db, sql, [...sets.map(([key]) => patch[key] ?? null), Number(id), POST_STATUS.publishing]);
    const post = await get(id);
    if (!post) {
      const error = new Error("Post not found.");
      error.status = 404;
      throw error;
    }
    if (!meta.changes) {
      throw conflict(post.status === POST_STATUS.sent ? "This post was already sent." : "This post is no longer being published.");
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
      const rows = await all(db, `SELECT * FROM ${TABLE} WHERE ${where} ORDER BY id DESC`, params);
      return rows.map(fromRow);
    },

    get,

    async start(post) {
      const eventId = eventKey(post.eventId);
      const nightOn = post.nightOn || "";
      try {
        // Not while this night has a post in flight; the unique index
        // instagram_posts_in_flight catches two requests at the same moment.
        const meta = await run(
          db,
          `INSERT INTO ${TABLE}
             (event_id, night_on, format, caption, image_asset, image_url, status, container_id, posted_by, created_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE NOT EXISTS (
             SELECT 1 FROM ${TABLE} WHERE event_id = ? AND IFNULL(night_on, '') = ? AND status = ?
           )`,
          [
            eventId,
            nightOn || null,
            post.format || POST_FORMATS.feed,
            post.caption || "",
            post.imageAsset || null,
            post.imageUrl || null,
            POST_STATUS.publishing,
            post.containerId || null,
            post.postedBy || "",
            post.createdAt || nowIso(),
            eventId,
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
  };
}
