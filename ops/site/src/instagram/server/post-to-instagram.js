/**
 * Use cases (#26): make one Instagram feed post for a series, a night or a
 * special, from ops.
 *
 *   draftPost   what the composer starts from: image, caption, history
 *   checkPost   Instagram fetches and checks image and caption; nothing is posted
 *   postNow     posts it, once
 *
 * Each takes its ports and nothing else:
 *   events     EventRepository (events/server/event-repository.js), read only
 *   posts      InstagramPostRepository (post-repository.js); null when this
 *              environment has no database for it yet
 *   publisher  InstagramPublisher (publisher.js)
 *   site       { projectId, origin }: the Sanity project images come from,
 *              and the website the caption links to
 *   now, sleep for tests; waitTries, waitMs how long to wait on Instagram
 */
import { recurrenceLabel, resolveOccurrenceContent, seriesSlug } from "../../events/server/event-content.js";
import {
  CAPTION_LIMIT,
  POST_STATUS,
  alreadyPosted,
  captionTemplate,
  checkedCaption,
  dayLabel,
  feedImageUrl,
  inFlight,
  isStale,
  newPost,
  nightIsLive,
  seriesIsLive,
} from "./post-model.js";
import { CONTAINER } from "./publisher.js";

function fail(message, status = 400, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  throw error;
}

const defaultSleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** The night, series or special a post is about, and what it says. */
async function subject({ events, site = {} }, { eventId, date = "" }) {
  const event = await events.get(eventId);
  if (event.deletedAt) fail("This event was deleted.", 404);
  const nights = (await events.nightsOf(eventId)).slice().sort((a, b) => a.date.localeCompare(b.date));
  const once = String(event.repeatUnit || "").toLowerCase() === "once";
  let night = null;
  let kind = "series";
  if (date) {
    night = nights.find((row) => row.date === date) || null;
    if (!night) fail("That night isn't in ops.", 404);
    kind = "night";
  } else if (once) {
    // A special is one night; its post is about the event as a whole.
    night = nights[0] || null;
    kind = "special";
  }

  const content = night
    ? resolveOccurrenceContent(event, night)
    : {
        title: String(event.name || "").trim(),
        artist: event.artist,
        offer: event.offer,
        pageUrl: event.pageUrl,
        shortDescription: event.shortDescription,
        time: event.time,
        startTime: event.startTime,
        image: event.mainImage,
      };
  const ownImage = Boolean(night?.overrides?.image);
  const framing = ownImage ? night.overrides.heroCrops || null : night?.overrides?.heroCrops || event.heroCrops || null;
  const imageAsset = content.image?.asset || "";
  const imageUrl = imageAsset ? feedImageUrl(site.projectId, imageAsset, framing) : "";
  const imageProblem = imageUrl
    ? ""
    : content.image
      ? "This image was added before images moved to the new store. Upload it again on Details to post it."
      : "Add an image on Details first.";

  const live = night ? nightIsLive(night) : seriesIsLive(nights);
  const origin = String(site.origin || "").replace(/\/+$/, "");
  const link = !origin
    ? ""
    : night?.slug
      ? `${origin}/events/${night.slug}`
      : `${origin}/whats-on/${event.slug || seriesSlug(event.name)}`;

  const when = night ? dayLabel(night.date) : recurrenceLabel(event);
  return {
    eventId: String(event.id),
    date: kind === "night" ? night.date : "",
    nightOn: kind === "night" ? night.date : "",
    kind,
    title: content.title,
    imageAsset,
    imageUrl,
    imageProblem,
    live,
    link,
    caption: captionTemplate({ ...content, when, link }),
  };
}

function assertImage(draft) {
  if (!draft.imageUrl) fail(draft.imageProblem, 409);
}

function assertLive(draft) {
  if (!draft.live) {
    const what = draft.kind === "night" ? "This night" : draft.kind === "special" ? "This event" : "This series";
    fail(`${what} isn't on the website yet. Update website first, so the link in the post works.`, 409, {
      code: "not-live",
    });
  }
}

/** Polls a container until Instagram has finished with it, or gives up waiting. */
async function waitForContainer(deps, containerId) {
  const sleep = deps.sleep || defaultSleep;
  const tries = deps.waitTries ?? 10;
  const ms = deps.waitMs ?? 2000;
  let status = "";
  for (let attempt = 0; attempt < tries; attempt += 1) {
    status = await deps.publisher.status(containerId);
    if (status !== CONTAINER.inProgress) return status;
    if (attempt < tries - 1) await sleep(ms);
  }
  return status || CONTAINER.inProgress;
}

const STILL_PREPARING =
  "Instagram is still preparing the image. Press Post again in a minute to finish; it won't post twice.";

/** What the composer starts from. Reads only; never calls Instagram. */
export async function draftPost(deps, { eventId, date = "" }) {
  const draft = await subject(deps, { eventId, date });
  const history = deps.posts ? await deps.posts.listFor(eventId, draft.nightOn) : [];
  return {
    ...draft,
    captionLimit: CAPTION_LIMIT,
    posts: history,
    lastPosted: alreadyPosted(history, eventId, draft.nightOn),
    posting: Boolean(inFlight(history, eventId, draft.nightOn)),
  };
}

/**
 * Instagram fetches the image and checks it and the caption, as for a real
 * post, but nothing is published: the container is never used and expires
 * after a day. Not stored.
 */
export async function checkPost(deps, { eventId, date = "", caption }) {
  const draft = await subject(deps, { eventId, date });
  assertImage(draft);
  const text = checkedCaption(caption);
  if (deps.publisher.mode === "dry-run") return { checked: false, dryRun: true, imageUrl: draft.imageUrl };
  const account = await deps.publisher.account();
  const containerId = await deps.publisher.createImage(draft.imageUrl, text);
  const status = await waitForContainer(deps, containerId);
  if (status === CONTAINER.inProgress) {
    fail("Instagram is still checking the image. Nothing was posted. Try Check again in a minute.", 409);
  }
  if (status !== CONTAINER.finished) {
    fail("Instagram couldn't use this image. Nothing was posted. Try a different image.", 422);
  }
  return { checked: true, account, imageUrl: draft.imageUrl };
}

/** Finish a post a stopped request left in flight. Never publishes a container twice. */
async function recover(deps, post) {
  const { posts, publisher } = deps;
  const status = post.containerId ? await publisher.status(post.containerId) : CONTAINER.error;
  if (status === CONTAINER.published) {
    // It went out; we only missed the answer. The address is unknown.
    return { post: await posts.finish(post.id, { mediaId: "", permalink: "", sentAt: deps.now().toISOString() }) };
  }
  if (status === CONTAINER.finished) return publishClaimed(deps, post);
  if (status === CONTAINER.inProgress) return { post, pending: true, message: STILL_PREPARING };
  await posts.fail(post.id, "Instagram dropped the image before it was posted.");
  return null;
}

/** Publish a claimed post's container and record it sent. */
async function publishClaimed(deps, claim) {
  const { posts, publisher } = deps;
  let mediaId;
  try {
    mediaId = await publisher.publish(claim.containerId);
  } catch (error) {
    // Instagram's own "no" is final. Anything else (no answer, its outage)
    // may have posted anyway: leave it in flight, and the next Post checks.
    if (error?.notReady) return { post: claim, pending: true, message: STILL_PREPARING };
    if (error?.graph && error.status !== 424) await posts.fail(claim.id, error.message);
    throw error;
  }
  const permalink = await publisher.permalink(mediaId).catch(() => "");
  const post = await posts.finish(claim.id, { mediaId, permalink, sentAt: deps.now().toISOString() });
  return { post };
}

/**
 * Post now. `again` confirms posting a night that was already posted. Returns
 * { post } once sent, { post, pending, message } while Instagram is still
 * preparing the image, or { dryRun } where nothing is sent.
 */
export async function postNow(deps, { eventId, date = "", caption, postedBy = "", again = false }) {
  deps = { now: () => new Date(), ...deps };
  const { posts, publisher } = deps;
  const draft = await subject(deps, { eventId, date });
  assertLive(draft);
  assertImage(draft);
  const text = checkedCaption(caption);
  if (publisher.mode === "dry-run") return { dryRun: true, imageUrl: draft.imageUrl, caption: text };
  if (!posts) fail("Instagram isn't set up in this environment yet.", 409, { notSetUp: true });

  const history = await posts.listFor(eventId, draft.nightOn);
  const flying = inFlight(history, eventId, draft.nightOn);
  if (flying) {
    if (!isStale(flying, deps.now())) {
      fail("This is already being posted. Wait a minute, then look at the list below.", 409, { code: "in-flight" });
    }
    const recovered = await recover(deps, flying);
    if (recovered) return { ...recovered, recovered: true };
  }

  const last = alreadyPosted(history, eventId, draft.nightOn);
  if (last && !again) {
    fail("This was already posted to Instagram. Confirm to post it again.", 409, { code: "already-posted" });
  }

  const quota = await publisher.quota().catch(() => null);
  if (quota?.total && quota.used >= quota.total) {
    fail("Instagram's limit on posts has been reached for now. Try again later.", 429);
  }

  const containerId = await publisher.createImage(draft.imageUrl, text);
  const claim = await posts.start(
    newPost({
      eventId: draft.eventId,
      nightOn: draft.nightOn,
      caption: text,
      imageAsset: draft.imageAsset,
      imageUrl: draft.imageUrl,
      containerId,
      postedBy,
      now: deps.now(),
    }),
  );
  // Someone else's Post got there first; this container is never published.
  if (!claim) fail("This is already being posted. Wait a minute, then look at the list below.", 409, { code: "in-flight" });

  const status = await waitForContainer(deps, containerId);
  if (status === CONTAINER.inProgress) return { post: claim, pending: true, message: STILL_PREPARING };
  if (status !== CONTAINER.finished) {
    const message = "Instagram couldn't use this image, so nothing was posted. Try a different image.";
    await posts.fail(claim.id, message);
    fail(message, 422);
  }
  return publishClaimed(deps, claim);
}

export { POST_STATUS };
