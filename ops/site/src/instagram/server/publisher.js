/**
 * InstagramPublisher (#26): the port the use cases post through. It speaks
 * in Instagram's steps, never in HTTP:
 *
 *   mode                       "live" (Meta), "fake" (our fake Instagram, dev),
 *                              "dry-run" (dev with no fake set: no calls at all)
 *   account()                  { id, username, profileUrl }
 *   quota()                    { used, total } posts in the last 24 hours, or null
 *   createImage(url, caption)  container id: Instagram fetches and checks the image
 *   status(containerId)        "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "PUBLISHED"
 *   publish(containerId)       media id: the post is now on the account
 *   permalink(mediaId)         the post's web address
 *
 * Failures throw with a plain-English message and a 4xx status, so the editor
 * reads what went wrong. Adapters: adapters/graph-publisher.js (Meta's Graph
 * API, or the fake Worker that mimics it), adapters/memory-publisher.js (tests).
 */
import { graphPublisher, graphSettings } from "./adapters/graph-publisher.js";

export const CONTAINER = Object.freeze({
  inProgress: "IN_PROGRESS",
  finished: "FINISHED",
  error: "ERROR",
  expired: "EXPIRED",
  published: "PUBLISHED",
});

/** A publisher that never calls anything: dev ops with no fake Instagram set. */
export function dryRunPublisher() {
  const refuse = async () => {
    const error = new Error("Instagram is in dry-run mode here: nothing is sent.");
    error.status = 409;
    throw error;
  };
  return {
    mode: "dry-run",
    account: async () => ({ id: "", username: "", profileUrl: "" }),
    quota: async () => null,
    createImage: refuse,
    status: refuse,
    publish: refuse,
    permalink: refuse,
  };
}

/**
 * The publisher for this runtime. Tests may hand one in as env.instagramPublisher.
 * Throws a plain error (status 503, `notSetUp`) when this environment has no
 * Instagram account set up.
 */
export function instagramPublisher(env, { fetchImpl } = {}) {
  if (env?.instagramPublisher) return env.instagramPublisher;
  const settings = graphSettings(env);
  if (settings.mode === "dry-run") return dryRunPublisher();
  return graphPublisher(settings, fetchImpl ? { fetchImpl } : {});
}
