/**
 * InstagramPostRepository in memory (#26): for tests, and the reference for
 * what every adapter must do (post-repository.contract.test.js).
 */
import { POST_STATUS, failedFields, sentFields } from "../post-model.js";

const copy = (value) => structuredClone(value);

function conflict(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

export function memoryPostRepository() {
  const posts = new Map();
  let nextId = 1;
  const newest = (a, b) => Number(b.id) - Number(a.id);

  const update = (id, change) => {
    const post = posts.get(String(id));
    if (!post) {
      const error = new Error("Post not found.");
      error.status = 404;
      throw error;
    }
    if (post.status !== POST_STATUS.publishing) {
      throw conflict(post.status === POST_STATUS.sent ? "This post was already sent." : "This post is no longer being published.");
    }
    Object.assign(post, change(post));
    return copy(post);
  };

  return {
    async listFor(eventId, nightOn) {
      return [...posts.values()]
        .filter((post) => post.eventId === String(eventId) && (nightOn === undefined || post.nightOn === (nightOn || "")))
        .sort(newest)
        .map(copy);
    },
    async get(id) {
      const post = posts.get(String(id));
      return post ? copy(post) : null;
    },
    async start(post) {
      const busy = [...posts.values()].some(
        (other) =>
          other.status === POST_STATUS.publishing &&
          other.eventId === String(post.eventId) &&
          other.nightOn === (post.nightOn || ""),
      );
      if (busy) return null;
      const id = String(nextId++);
      const saved = { ...copy(post), id, eventId: String(post.eventId), nightOn: post.nightOn || "", status: POST_STATUS.publishing };
      posts.set(id, saved);
      return copy(saved);
    },
    async finish(id, fields) {
      return update(id, (post) => {
        const { status, mediaId, permalink, sentAt } = sentFields(post, { mediaId: fields.mediaId, permalink: fields.permalink });
        return { status, mediaId, permalink, sentAt: fields.sentAt || sentAt, lastError: "" };
      });
    },
    async fail(id, error) {
      return update(id, (post) => failedFields(post, error));
    },
  };
}
