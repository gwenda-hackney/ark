/**
 * The Instagram domain (#26): posts made from ops and the rules about them.
 * No I/O and no storage names: records come from and go to the
 * InstagramPostRepository (post-repository.js), whatever stores them.
 *
 * InstagramPost: { id, eventId, nightOn, format, caption, imageAsset,
 *   imageUrl, status, containerId, mediaId, permalink, postedBy, lastError,
 *   createdAt, sentAt }
 *
 * `nightOn` is a night's date (YYYY-MM-DD), or "" for a post about a series
 * or a special as a whole. One post is "in flight" (publishing) per night at
 * a time; storage enforces it, so two clicks can't post twice.
 */
import { parseImageAssetId, sanityImageUrl } from "../../../../../shared/sanity-image.js";

export const POST_STATUS = Object.freeze({
  publishing: "publishing",
  sent: "sent",
  failed: "failed",
});

export const POST_FORMATS = Object.freeze({ feed: "feed" });

/** Instagram's own limits for a feed post's caption. */
export const CAPTION_LIMIT = 2200;
export const HASHTAG_LIMIT = 30;
export const MENTION_LIMIT = 20;

/** A 4:5 portrait feed image, the tallest Instagram shows uncropped. */
export const FEED_IMAGE = Object.freeze({ width: 1080, height: 1350 });

/** Brand background (#0d0d0d) around an image shown whole. */
export const WHOLE_IMAGE_BACKGROUND = "0d0d0d";

/**
 * A post still "publishing" after this long was left by a request that
 * stopped (a crash, a timeout, or Instagram still preparing the image). The
 * next attempt looks at the container instead of waiting on it.
 */
export const STALE_AFTER_MS = 60_000;

const TRANSITIONS = {
  [POST_STATUS.publishing]: new Set([POST_STATUS.sent, POST_STATUS.failed]),
  [POST_STATUS.sent]: new Set(),
  [POST_STATUS.failed]: new Set(),
};

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]?.has(to));
}

/** The record for a post about to go: in flight until it is sent or fails. */
export function newPost({
  eventId,
  nightOn = "",
  caption = "",
  imageAsset = "",
  imageUrl = "",
  containerId = "",
  postedBy = "",
  now = new Date(),
}) {
  if (!eventId) fail("A post needs its event.");
  return {
    eventId: String(eventId),
    nightOn: nightOn || "",
    format: POST_FORMATS.feed,
    caption: String(caption),
    imageAsset: imageAsset || "",
    imageUrl: imageUrl || "",
    status: POST_STATUS.publishing,
    containerId: containerId || "",
    mediaId: "",
    permalink: "",
    postedBy: postedBy || "",
    lastError: "",
    createdAt: now.toISOString(),
    sentAt: "",
  };
}

/** The fields that mark a post sent. A post is sent once, never twice. */
export function sentFields(post, { mediaId, permalink = "", now = new Date() }) {
  if (post?.status === POST_STATUS.sent) fail("This post was already sent.", 409);
  if (!canTransition(post?.status, POST_STATUS.sent)) fail("Only a post being published can be marked sent.", 409);
  return { status: POST_STATUS.sent, mediaId: String(mediaId || ""), permalink: permalink || "", sentAt: now.toISOString() };
}

export function failedFields(post, error) {
  if (!canTransition(post?.status, POST_STATUS.failed)) fail("Only a post being published can fail.", 409);
  return { status: POST_STATUS.failed, lastError: String(error || "Something went wrong.").slice(0, 500) };
}

/** Left in flight by a request that is no longer running. */
export function isStale(post, now = new Date()) {
  if (post?.status !== POST_STATUS.publishing) return false;
  const started = Date.parse(post.createdAt || "");
  return !Number.isFinite(started) || now.getTime() - started >= STALE_AFTER_MS;
}

/** The latest sent post for this event and night ("" for the series), or null. */
export function alreadyPosted(posts, eventId, date = "") {
  return (
    (posts || [])
      .filter(
        (post) =>
          post.status === POST_STATUS.sent &&
          String(post.eventId) === String(eventId) &&
          (post.nightOn || "") === (date || ""),
      )
      .sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)))[0] || null
  );
}

/** The post in flight for this night, or null. */
export function inFlight(posts, eventId, date = "") {
  return (
    (posts || []).find(
      (post) =>
        post.status === POST_STATUS.publishing &&
        String(post.eventId) === String(eventId) &&
        (post.nightOn || "") === (date || ""),
    ) || null
  );
}

// ------------------------------------------------------------------ caption

export function countHashtags(caption) {
  return (String(caption).match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length;
}

export function countMentions(caption) {
  return (String(caption).match(/(^|\s)@[\w.]+/g) || []).length;
}

/** What's wrong with a caption, in plain words; empty when it's fine. */
export function captionProblems(caption) {
  const text = String(caption ?? "");
  const problems = [];
  if (!text.trim()) problems.push("Write a caption first.");
  if ([...text].length > CAPTION_LIMIT) {
    problems.push(`The caption is ${[...text].length.toLocaleString("en-GB")} characters. Instagram allows ${CAPTION_LIMIT.toLocaleString("en-GB")}.`);
  }
  const tags = countHashtags(text);
  if (tags > HASHTAG_LIMIT) problems.push(`The caption has ${tags} hashtags. Instagram allows ${HASHTAG_LIMIT}.`);
  const mentions = countMentions(text);
  if (mentions > MENTION_LIMIT) problems.push(`The caption mentions ${mentions} accounts. Instagram allows ${MENTION_LIMIT}.`);
  return problems;
}

export function checkedCaption(caption) {
  const problems = captionProblems(caption);
  if (problems.length) fail(problems.join(" "), 400);
  return String(caption).trim();
}

/** "@handle" from an Instagram address, else "". */
export function instagramHandle(pageUrl) {
  const match = /^https?:\/\/(?:www\.)?instagram\.com\/([\w.]+)\/?/i.exec(String(pageUrl || "").trim());
  return match ? `@${match[1]}` : "";
}

/** "7pm", "7.30pm" from "19:00", "19:30". */
export function clockLabel(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 || 12;
  return minutes === "00" ? `${hour12}${suffix}` : `${hour12}.${minutes}${suffix}`;
}

/** "Wednesday 8 October" for a YYYY-MM-DD date. */
export function dayLabel(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) return "";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));
}

/**
 * The caption an editor starts from: title, when, guest, offer, the short
 * description and the web address. Blank lines between parts, as Instagram
 * shows them.
 */
export function captionTemplate({ title, when, time, startTime, artist, pageUrl, offer, shortDescription, link }) {
  const whenLine = [when, String(time || "").trim() || clockLabel(startTime)].filter(Boolean).join(", ");
  const guest = instagramHandle(pageUrl) || String(artist || "").trim();
  const parts = [
    String(title || "").trim(),
    whenLine,
    guest ? `With ${guest}` : "",
    String(offer || "").trim(),
    String(shortDescription || "").trim(),
    link ? `More at ${String(link).replace(/^https?:\/\//, "")}` : "",
  ].filter(Boolean);
  return parts.join("\n\n");
}

// ------------------------------------------------------------------ image

function clamp01(value, fallback = 0.5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

/**
 * Where to centre a 4:5 frame: the hotspot when the editor framed the photo,
 * else the middle of their crop, else the middle of the photo.
 */
export function focalPoint(framing) {
  if (!framing || typeof framing !== "object") return null;
  const hotspot = framing.hotspot;
  if (hotspot && hotspot.x != null && hotspot.y != null) {
    return { x: clamp01(hotspot.x), y: clamp01(hotspot.y) };
  }
  const crop = framing.crop || framing.main || framing.card;
  if (crop && typeof crop === "object") {
    const left = clamp01(crop.left, 0);
    const right = clamp01(crop.right, 0);
    const top = clamp01(crop.top, 0);
    const bottom = clamp01(crop.bottom, 0);
    return { x: left + (1 - left - right) / 2, y: top + (1 - top - bottom) / 2 };
  }
  return null;
}

/**
 * The 1080x1350 JPEG Instagram gets, from a Sanity asset id. "Whole image"
 * (#27) fits the photo inside the frame on the brand background; otherwise
 * the frame fills, centred on the editor's framing.
 *
 * A shared 4:5 frame helper for the website is coming (shared/sanity-frame.js);
 * this one should move onto it.
 */
export function feedImageUrl(projectId, assetId, framing, { dataset = "production" } = {}) {
  if (!parseImageAssetId(assetId)) return "";
  const size = { w: FEED_IMAGE.width, h: FEED_IMAGE.height, fm: "jpg", q: 90 };
  if (framing?.fit === "whole") {
    return sanityImageUrl(projectId, assetId, { ...size, fit: "fill", bg: WHOLE_IMAGE_BACKGROUND }, dataset);
  }
  const point = focalPoint(framing);
  const params = point
    ? { ...size, fit: "crop", crop: "focalpoint", "fp-x": point.x.toFixed(4), "fp-y": point.y.toFixed(4) }
    : { ...size, fit: "crop" };
  return sanityImageUrl(projectId, assetId, params, dataset);
}

// ------------------------------------------------------------------ website

/** A night is on the website once it has been published there. */
export function nightIsLive(night) {
  return Boolean(night?.snapshots?.production);
}

/** A series is on the website once any of its nights is. */
export function seriesIsLive(nights) {
  return (nights || []).some(nightIsLive);
}
