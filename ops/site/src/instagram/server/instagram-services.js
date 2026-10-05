/**
 * Wires the Instagram use cases to this runtime (#26): the repositories and
 * the publisher from env, and whether Instagram is set up here at all. The
 * API functions call this, then a use case; nothing else.
 */
import { eventRepository } from "../../events/server/event-repository.js";
import { sanityProjectId } from "../../platform/sanity.js";
import { siteUrls } from "../../website/server/site-urls.js";
import { instagramPostRepository } from "./post-repository.js";
import { instagramPublisher } from "./publisher.js";

export const NOT_SET_UP = "Instagram isn't set up in this environment yet.";

/**
 * { deps, setup }. setup: { ready, mode, message, detail }; mode is "live",
 * "fake", "dry-run" or "off". `detail` says what's missing, for whoever sets it up.
 */
export function instagramServices(env) {
  let posts = null;
  let storageProblem = "";
  try {
    posts = instagramPostRepository(env);
  } catch (error) {
    storageProblem = error instanceof Error ? error.message : String(error);
  }
  let publisher = null;
  let publisherProblem = "";
  try {
    publisher = instagramPublisher(env);
  } catch (error) {
    if (!error?.notSetUp) throw error;
    publisherProblem = error.message;
  }
  const ready = Boolean(posts && publisher);
  return {
    deps: {
      events: eventRepository(env),
      posts,
      publisher,
      site: { projectId: sanityProjectId(env), origin: siteUrls(env).live },
    },
    setup: {
      ready,
      mode: publisher?.mode || "off",
      message: ready ? "" : NOT_SET_UP,
      detail: [storageProblem && `Posts can't be stored: ${storageProblem}`, publisherProblem].filter(Boolean).join(" "),
    },
  };
}

/** The account posts go to, for the Post button. Reads Instagram live. */
export async function instagramStatus(env) {
  const { deps, setup } = instagramServices(env);
  if (!deps.publisher || setup.mode === "dry-run") return { ...setup, account: null, quota: null };
  try {
    const [account, quota] = await Promise.all([deps.publisher.account(), deps.publisher.quota().catch(() => null)]);
    return { ...setup, account, quota };
  } catch (error) {
    return { ...setup, account: null, quota: null, accountError: error instanceof Error ? error.message : String(error) };
  }
}
