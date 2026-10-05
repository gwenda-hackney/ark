/**
 * InstagramPostRepository (#26): the only way the Instagram domain reads or
 * writes storage. It speaks in records (post-model.js), never in tables or
 * columns. Each adapter implements all of it, and
 * post-repository.contract.test.js holds every adapter to the same behaviour:
 *
 *   listFor(eventId, nightOn?)  InstagramPost[], newest first. Without nightOn,
 *                               every post for the event; with it, that night's
 *                               ("" for the series or special as a whole).
 *   get(id)                     InstagramPost, or null when missing
 *   start(post)                 InstagramPost with its id: the in-flight claim.
 *                               null while the same night already has a post
 *                               publishing, so a second attempt can't post twice.
 *   finish(id, fields)          InstagramPost, now sent ({ mediaId, permalink, sentAt }).
 *                               A 409 when it isn't publishing (sent twice).
 *   fail(id, error)             InstagramPost, now failed with lastError.
 *                               A 409 when it isn't publishing.
 *
 * D1 (gwenda-ops, OPS_DB) is the adapter. Without the binding the factory
 * throws databaseFor's plain error, and ops says Instagram isn't set up here.
 */
import { databaseFor } from "../../../../../shared/d1-env.js";
import { d1PostRepository } from "./adapters/d1-posts.js";

/** The repository for this runtime. Tests may hand one in as env.instagramPostRepository. */
export function instagramPostRepository(env) {
  return env?.instagramPostRepository || d1PostRepository(databaseFor(env, "ops"));
}
