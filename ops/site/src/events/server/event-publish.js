/**
 * Saving an event stages it: its series and nights are written as drafts.
 * The preview site reads them live (What's on and the event pages).
 * The website only changes when the drafts are published (Put on website,
 * or Website > Preview → live). A night dropped from the schedule is a draft
 * too: marked `removed`, it leaves the website when the series is published.
 * Deleting a night or a live event works the same way (#23).
 */
import {
  PREVIEW,
  sanityMutate,
  sanityQuery,
  sanityRenameImageAsset,
  sanityUploadImage,
} from "../../platform/sanity.js";
import {
  getReleaseDiff,
  markReleasedInOps,
  planRelease,
  publishRelease,
  releaseDocument,
  stableStringify,
} from "../../website/server/release.js";
import { siteEnvName } from "../../platform/config-store.js";
import { environmentOf, readState, writeState } from "../../../../../shared/config.js";
import {
  expandOccurrenceDates,
  expandSeriesOccurrenceDates,
  todayIso,
} from "../event-recurrence.js";
import {
  occurrenceHash,
  occurrenceSlug,
  recurrenceLabel,
  resolveOccurrenceContent,
  publishedReplacesSeries,
  seriesDescriptionForPublish,
  seriesShortDescriptionForPublish,
  sanityEventDocument,
  sanitySeriesDocument,
  sanitySeriesId,
  seriesAwaitingDates,
  seriesScheduleMode,
} from "./event-content.js";
import {
  getEvent,
  hasShortDescriptionOverrideColumn,
  listEvents,
  previewBehind,
  removeOccurrence,
  saveOccurrenceSnapshots,
  saveOccurrences,
  setEventDeletedAt,
  deleteEvent,
} from "./event-store.js";
import { forgetCalendarOccurrences } from "./event-calendar-sync.js";
import { syncSocialTasks } from "./event-tasks.js";
import {
  GALLERY_ENABLED,
  galleryBehind,
  galleryFingerprint,
  listGalleryFiles,
  readGalleryStaged,
  recordGalleryStaged,
  syncGalleryImages,
} from "./event-gallery.js";

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

/** Sanity filename for an ops photo: Baserow file names are unique per upload. */
function assetFilename(image) {
  const name = String(image?.name || "").trim();
  return name ? `ops-${name}` : "";
}

function imageRef(assetId) {
  return {
    _type: "image",
    alt: "",
    asset: { _type: "reference", _ref: assetId },
  };
}

/**
 * Photos already in Sanity, by ops filename, so saves reuse them instead of
 * downloading and uploading the same bytes again. One query for all of them.
 */
export async function existingImageAssets(env, images) {
  const names = [...new Set(images.map(assetFilename).filter(Boolean))];
  const found = new Map();
  if (!names.length) return found;
  const rows =
    (await sanityQuery(
      env,
      PREVIEW,
      `*[_type == "sanity.imageAsset" && originalFilename in $names]{ _id, originalFilename }`,
      { names },
    )) || [];
  for (const row of rows) found.set(row.originalFilename, row._id);
  return found;
}

async function imageFromUrl(url, upload, filename = "event.jpg") {
  if (!url) return undefined;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    httpError("Could not read the main image.", 502);
  }
  const bytes = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "image/jpeg";
  const asset = await upload(bytes, { filename, contentType });
  if (!asset?._id) return undefined;
  return { ...imageRef(asset._id), originalFilename: asset.originalFilename };
}

/** Sanity image for an ops photo: reuse the uploaded asset, else upload once. */
export async function heroImage(env, image, known) {
  const url = String(image?.url || "").trim();
  if (!url) return undefined;
  const filename = assetFilename(image);
  const assetId = filename ? known.get(filename) : "";
  if (assetId) return imageRef(assetId);
  const hero = await imageFromUrl(
    url,
    (bytes, meta) => sanityUploadImage(env, bytes, meta),
    filename || "event.jpg",
  );
  if (!hero) return hero;
  const { originalFilename, ...uploaded } = hero;
  if (filename) {
    known.set(filename, uploaded.asset._ref);
    if (originalFilename !== filename) {
      await sanityRenameImageAsset(env, uploaded.asset._ref, filename);
    }
  }
  return uploaded;
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Attach Sanity crop + hotspot from ops hero framing. */
function withImageCrop(image, framingOrCrop) {
  if (!image || !framingOrCrop || typeof framingOrCrop !== "object")
    return image;
  const framing = framingOrCrop.crop
    ? framingOrCrop
    : { crop: framingOrCrop, hotspot: framingOrCrop.hotspot };
  const cropSrc = framing.crop || framingOrCrop;
  const left = clamp01(cropSrc.left);
  const top = clamp01(cropSrc.top);
  const right = clamp01(cropSrc.right);
  const bottom = clamp01(cropSrc.bottom);
  const width = Math.max(0.02, 1 - left - right);
  const height = Math.max(0.02, 1 - top - bottom);
  const hotspotSrc = framing.hotspot || {};
  const hotspotWidth = clamp01(hotspotSrc.width) || Math.min(0.45, width);
  const hotspotHeight = clamp01(hotspotSrc.height) || Math.min(0.45, height);
  const hotspotX =
    hotspotSrc.x != null ? clamp01(hotspotSrc.x) : left + width / 2;
  const hotspotY =
    hotspotSrc.y != null ? clamp01(hotspotSrc.y) : top + height / 2;
  return {
    ...image,
    crop: {
      _type: "sanity.imageCrop",
      left,
      top,
      right,
      bottom,
    },
    hotspot: {
      _type: "sanity.imageHotspot",
      x: hotspotX,
      y: hotspotY,
      width: hotspotWidth,
      height: hotspotHeight,
    },
  };
}

function framingFromEvent(event) {
  const raw = event?.heroCrops;
  if (!raw || typeof raw !== "object") return null;
  if (raw.crop || raw.hotspot) return raw;
  // Legacy main/card → prefer main, else card
  if (raw.main || raw.card) {
    return { crop: raw.main || raw.card, hotspot: null };
  }
  return null;
}

function framingFromOccurrence(event, occurrence) {
  const override = occurrence?.overrides?.heroCrops;
  if (override && typeof override === "object") {
    if (override.crop || override.hotspot) return override;
    if (override.main || override.card) {
      return { crop: override.main || override.card, hotspot: null };
    }
  }
  return framingFromEvent(event);
}

const SERIES_PREVIEWS_KEY = "site.series_previews";

/**
 * A series waiting for dates has no nights to hold a preview snapshot, so the
 * last one staged is kept here, by event id: `{ [id]: seriesPreviewHash }`.
 */
export function seriesPreviewHash(event) {
  return occurrenceHash(event, "");
}

export async function readSeriesPreviews(env) {
  try {
    const parsed = JSON.parse(
      (await readState(env, "ops", SERIES_PREVIEWS_KEY, environmentOf(env))) || "{}",
    );
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function recordSeriesPreview(env, event, datesPending) {
  const previews = await readSeriesPreviews(env);
  const id = String(event.id);
  const hash = datesPending ? seriesPreviewHash(event) : undefined;
  if (previews[id] === hash) return;
  const next = { ...previews };
  if (hash) next[id] = hash;
  else delete next[id];
  await writeState(env, "ops", SERIES_PREVIEWS_KEY, environmentOf(env), JSON.stringify(next));
}

/**
 * The series' Drive gallery as Sanity images. If Drive cannot be read, keep
 * the gallery already staged rather than emptying it.
 */
async function stageGallery(env, event) {
  if (!GALLERY_ENABLED) {
    return { images: [], complete: false, fingerprint: "", changed: false, error: "" };
  }
  const staged = await readGalleryStaged(env);
  try {
    const files = await listGalleryFiles(env, event);
    const fingerprint = galleryFingerprint(files);
    const { images, complete } = await syncGalleryImages(env, files);
    return {
      images,
      complete,
      fingerprint,
      changed:
        staged[String(event.id)] !== fingerprint &&
        (images.length > 0 || String(event.id) in staged),
      error: "",
    };
  } catch (error) {
    const current = await sanityQuery(
      env,
      PREVIEW,
      `*[_id == $id][0].gallery`,
      { id: sanitySeriesId(event.slug) },
    ).catch(() => null);
    return {
      images: Array.isArray(current) ? current : [],
      complete: false,
      fingerprint: "",
      changed: false,
      error: `The gallery could not be copied from Drive: ${error?.message || "unknown error"}.`,
    };
  }
}

export async function publishEventPreview(
  env,
  id,
  _options = {},
) {
  const event = await getEvent(env, id);
  // Series and night pages are built ahead of time; the diary is read live.
  let pagesChanged = !event.dates.some((row) => row.snapshots?.preview);
  if (!event.name) httpError("Name is required.", 400);
  const description = seriesDescriptionForPublish(event);
  const shortDescription = seriesShortDescriptionForPublish(event);
  if (!description)
    httpError("Description is required before publishing.", 400);
  const today = todayIso();
  const wanted = expandOccurrenceDates(event, { today });
  const materialized = new Set(expandSeriesOccurrenceDates(event));
  const drop = event.dates.filter(
    (row) => row.date >= today && !materialized.has(row.date),
  );
  // No nights yet goes on the website as "Check back soon for the next date". An ended series
  // still has its dropped nights to take off the website.
  const datesPending = seriesAwaitingDates(event);
  if (!wanted.length && !drop.length && !datesPending) {
    httpError("There is no upcoming date to publish.", 400);
  }

  const existingByDate = new Map(event.dates.map((row) => [row.date, row]));
  const heroByUrl = new Map();
  const occurrences = [];
  const mutations = [];

  const knownAssets = await existingImageAssets(env, [
    event.mainImage,
    ...wanted.map(
      (date) => resolveOccurrenceContent(event, existingByDate.get(date) || date).image,
    ),
  ]);
  const seriesImageUrl = event.mainImage?.url || "";
  let seriesHero;
  if (seriesImageUrl) {
    const uploaded = await heroImage(env, event.mainImage, knownAssets);
    seriesHero = withImageCrop(
      uploaded ? { ...uploaded, alt: event.name } : uploaded,
      framingFromEvent(event),
    );
    if (seriesHero && !seriesHero.alt) {
      seriesHero = { ...seriesHero, alt: event.name };
    }
    heroByUrl.set(`series:${seriesImageUrl}`, seriesHero);
  }
  const gallery = await stageGallery(env, event);
  if (gallery.changed) pagesChanged = true;
  mutations.push({
    createOrReplace: sanitySeriesDocument({
      slug: event.slug,
      title: event.name,
      description,
      shortDescription,
      recurrence: recurrenceLabel(event),
      schedule: seriesScheduleMode(event),
      replacesSeriesId: publishedReplacesSeries(event.replacesSeries),
      nightSchedule: event.nightSchedule || [],
      heroImage: seriesHero || null,
      datesPending,
      gallery: gallery.images,
      formerSlugs: event.formerSlugs || [],
    }),
  });

  const ownShortColumn = await hasShortDescriptionOverrideColumn(env);
  const keptShort = new Map();
  if (!ownShortColumn) {
    const ids = wanted
      .map((date) => existingByDate.get(date)?.sanityId)
      .filter(Boolean);
    if (ids.length) {
      const rows =
        (await sanityQuery(
          env,
          PREVIEW,
          `*[_id in $ids]{ _id, shortDescription }`,
          { ids },
        )) || [];
      for (const row of rows) {
        keptShort.set(row._id, String(row.shortDescription || "").trim());
      }
    }
  }

  for (const date of wanted) {
    const previous = existingByDate.get(date);
    const hash = occurrenceHash(event, previous || date);
    if (previous?.sanityId && previous?.snapshots?.preview?.hash === hash) {
      occurrences.push({
        // Nothing to write back unless its ClickUp task changes below.
        unchanged: true,
        previousTaskId: previous.clickupTaskId || "",
        id: previous.id,
        date: previous.date,
        slug: previous.slug,
        label: `${resolveOccurrenceContent(event, previous).title} · ${date}`,
        sanityId: previous.sanityId,
        clickupTaskId: previous.clickupTaskId || "",
        overrides: previous.overrides,
        isSpecialEdition: previous.isSpecialEdition,
        snapshots: previous.snapshots,
      });
      continue;
    }
    if (!previous?.sanityId) pagesChanged = true;
    const content = resolveOccurrenceContent(event, previous || date);
    // A night keeps its slug when the series gets a new web address: RSVPs
    // and ticket links are keyed by it.
    const slug = previous?.slug || occurrenceSlug(event.slug, date);
    const imageUrl = content.image?.url || "";
    let hero = heroByUrl.get(imageUrl);
    if (imageUrl && !heroByUrl.has(imageUrl)) {
      hero = await heroImage(env, content.image, knownAssets);
      heroByUrl.set(imageUrl, hero);
    }
    if (hero) {
      hero = withImageCrop(
        { ...hero, alt: content.title },
        framingFromOccurrence(event, previous),
      );
    }
    if (seriesHero && !seriesHero.alt) {
      seriesHero = { ...seriesHero, alt: event.name || content.title };
    }
    const doc = sanityEventDocument({
      slug,
      title: content.title,
      date,
      description: content.description,
      shortDescription:
        content.shortDescription ||
        (!ownShortColumn && previous?.sanityId
          ? keptShort.get(previous.sanityId)
          : "") ||
        "",
      artist: content.artist,
      offer: content.offer,
      pageUrl: content.pageUrl,
      heroImage: hero,
      seriesHeroImage: seriesHero || null,
      seriesId: event.slug,
      seriesTitle: event.name,
      recurrence: recurrenceLabel(event),
      time: content.time,
      startTime: content.startTime,
      endTime: content.endTime,
      nightSchedule: content.nightSchedule || [],
      isSpecialEdition: content.isSpecialEdition,
    });
    mutations.push({ createOrReplace: doc });
    occurrences.push({
      id: previous?.id,
      date,
      slug,
      label: `${content.title} · ${date}`,
      sanityId: doc._id,
      clickupTaskId: previous?.clickupTaskId || "",
      overrides: previous?.overrides,
      isSpecialEdition: content.isSpecialEdition,
      snapshots: {
        ...(previous?.snapshots || {}),
        preview: {
          hash,
          at: new Date().toISOString(),
        },
      },
    });
  }
  for (let i = 0; i < mutations.length; i += 25) {
    await sanityMutate(env, mutations.slice(i, i + 25));
  }
  await recordSeriesPreview(env, event, datesPending);
  if (gallery.complete) await recordGalleryStaged(env, event.id, gallery.fingerprint);

  const warnings = [];
  if (drop.length) pagesChanged = true;
  const dropped = await markNightsRemoved(env, drop);
  warnings.push(...dropped.warnings);
  // Keep the rows when marking failed, so the next run tries again.
  if (!dropped.warnings.length) warnings.push(...(await settleDroppedRows(env, drop, dropped.live)));
  const retired = await retireFormerSeries(
    env,
    event,
    new Set(occurrences.map((row) => row.sanityId)),
  );
  if (retired.changed) pagesChanged = true;
  warnings.push(...retired.warnings);

  const tasks =
    siteEnvName(env) === "dev"
      ? { dates: occurrences, warnings: [] }
      : await syncSocialTasks(env, event, occurrences);
  warnings.push(...tasks.warnings);
  // One Baserow write per changed night only: a series has a dozen nights and
  // Cloudflare allows 50 outbound calls per request on the free plan.
  const changed = [];
  for (const { unchanged, previousTaskId, ...occurrence } of tasks.dates) {
    if (unchanged && (occurrence.clickupTaskId || "") === previousTaskId) continue;
    changed.push(occurrence);
  }
  await saveOccurrences(env, id, changed);

  // No build here: the site updates once edits go quiet (site-pending.js).
  const deployed = false;
  const deploy = null;

  if (gallery.error) warnings.push(gallery.error);

  return {
    event: await getEvent(env, id),
    warnings,
    galleryError: gallery.error,
    deployed,
    deploy,
    pagesChanged,
    target: "preview",
  };
}

/**
 * Stage after a save. A save always succeeds on its own; preview problems
 * (no description yet, no upcoming date) come back as `preview.error`.
 */
export async function stageEvent(env, id) {
  try {
    const result = await publishEventPreview(env, id);
    return {
      event: await withWebsiteStatus(env, result.event),
      preview: {
        ok: true,
        local: siteEnvName(env) === "dev",
        warnings: result.warnings,
        deployed: result.deployed,
        deploy: result.deploy,
      },
    };
  } catch (error) {
    return {
      event: null,
      preview: {
        ok: false,
        local: siteEnvName(env) === "dev",
        error: error?.message || "Could not stage this event.",
        warnings: [],
      },
    };
  }
}

export async function publishAllEventPreviews(env) {
  const source = await listEvents(env);
  const published = [];
  const failed = [];
  const skipped = [];
  const warnings = [];
  let pagesChanged = false;

  for (const event of source) {
    if (event.publish?.preview === "current") {
      skipped.push({ id: event.id, name: event.name });
      continue;
    }
    try {
      const result = await publishEventPreview(env, event.id, {
        deploy: false,
      });
      if (result.pagesChanged) pagesChanged = true;
      published.push({
        id: event.id,
        name: event.name,
        warnings: result.warnings || [],
      });
      warnings.push(
        ...(result.warnings || []).map(
          (warning) => `${event.name}: ${warning}`,
        ),
      );
    } catch (error) {
      failed.push({
        id: event.id,
        name: event.name,
        error: error?.message || "Preview publish failed.",
      });
    }
  }

  const deployed = false;
  const deploy = null;

  return {
    events: await listEvents(env),
    published,
    failed,
    skipped,
    warnings,
    deployed,
    deploy,
    target: "preview",
  };
}

/** Takes nights off the preview and the website together. */
export async function unpublishOccurrences(env, rows) {
  const warnings = [];
  for (const row of rows || []) {
    if (!row?.sanityId) continue;
    try {
      await sanityMutate(env, [{ delete: { id: row.sanityId } }]);
    } catch (error) {
      warnings.push(
        error?.message || `Could not take ${row.date} off the website.`,
      );
    }
  }
  return warnings;
}

/**
 * After their drafts are marked: a dropped night that never went live is done,
 * so its row goes. One still on the live site keeps its row until Update
 * website takes it off (markReleasedInOps), noted as `snapshots.preview.removed`
 * so ops knows the preview is in step. If that draft is discarded, the note
 * goes (markDiscardedInOps) and the website job marks it again (#20). Either
 * way the calendar entry goes now: the calendar follows the schedule.
 */
async function settleDroppedRows(env, rows, live) {
  const kept = rows.filter((row) => row.id && live.has(row.sanityId));
  for (const row of rows) {
    if (row.id && !live.has(row.sanityId)) await removeOccurrence(env, row.id);
  }
  const warnings = await forgetCalendarOccurrences(env, kept);
  const at = new Date().toISOString();
  await saveOccurrenceSnapshots(
    env,
    kept.map((row) => ({
      id: Number(row.id),
      snapshots: { ...row.snapshots, preview: { removed: true, at } },
      clearCalendar: true,
    })),
  );
  return warnings;
}

/**
 * Dropped from the schedule: a night on the website gets a draft marked
 * `removed` (the preview hides it; publishing deletes it), one that never went
 * live just loses its draft. Returns the warnings and which ids were live.
 */
export async function markNightsRemoved(env, rows, { query = sanityQuery, mutate = sanityMutate } = {}) {
  const ids = (rows || []).map((row) => row?.sanityId).filter(Boolean);
  if (!ids.length) return { warnings: [], live: new Set() };
  const live = new Set((await query(env, "production", "*[_id in $ids]._id", { ids })) || []);
  const mutations = ids.map((id) =>
    live.has(id) ? { patch: { id, set: { removed: true } } } : { delete: { id } },
  );
  const warnings = [];
  try {
    await mutate(env, mutations);
  } catch (error) {
    warnings.push(error?.message || "Could not take the dropped nights off the preview.");
  }
  return { warnings, live };
}

/**
 * After the series gets a new web address, the old series document goes with
 * the next "Update website", like a dropped night. Nights not restaged above
 * (past ones) move to the new series first, or the old one could not go.
 */
export async function retireFormerSeries(
  env,
  event,
  written = new Set(),
  { query = sanityQuery, mutate = sanityMutate } = {},
) {
  const former = event.formerSlugs || [];
  if (!former.length) return { changed: false, warnings: [] };
  const found =
    (await query(
      env,
      PREVIEW,
      `*[removed != true && (_id in $seriesIds || (_type == "event" && seriesId in $former))]{ _id, _type }`,
      { seriesIds: former.map(sanitySeriesId), former },
    )) || [];
  const nights = found
    .filter((doc) => doc._type === "event" && !written.has(doc._id))
    .map((doc) => doc._id);
  const series = found.filter((doc) => doc._type === "eventSeries");
  if (!nights.length && !series.length) return { changed: false, warnings: [] };
  if (nights.length) {
    const set = {
      seriesId: event.slug,
      series: { _type: "reference", _ref: sanitySeriesId(event.slug) },
    };
    try {
      await mutate(env, nights.map((id) => ({ patch: { id, set } })));
    } catch (error) {
      // Leave the old series be: its nights still point at it.
      return {
        changed: true,
        warnings: [error?.message || "Could not move past nights to the new web address."],
      };
    }
  }
  const { warnings } = await markNightsRemoved(
    env,
    series.map((doc) => ({ sanityId: doc._id })),
    { query, mutate },
  );
  return { changed: true, warnings };
}

/** Series documents under the current and former web addresses. */
function seriesKeys(event) {
  const slugs = [event.slug, ...(event.formerSlugs || [])].filter(Boolean);
  return { slugs, seriesIds: slugs.map(sanitySeriesId) };
}

/** Nights first: Sanity won't delete a series while live nights refer to it. */
function seriesLast(ids, seriesIds) {
  const series = new Set(seriesIds);
  return [...ids.filter((id) => !series.has(id)), ...ids.filter((id) => series.has(id))];
}

/**
 * Every published document that belongs to this event, on either side: the
 * series and each night (including nights removed in ops but still live), and
 * the series under a former web address until the website lets it go.
 */
export async function eventDocumentIds(env, event, { query = sanityQuery } = {}) {
  const { slugs, seriesIds } = seriesKeys(event);
  const groq = `*[!(_id in path("drafts.**")) && (_id in $seriesIds || (_type == "event" && seriesId in $slugs))]._id`;
  const params = { seriesIds, slugs };
  const [preview, production] = await Promise.all([
    query(env, PREVIEW, groq, params),
    query(env, "production", groq, params),
  ]);
  const ids = new Set([seriesIds[0], ...(preview || []), ...(production || [])]);
  for (const row of event.dates || []) if (row.sanityId) ids.add(row.sanityId);
  return seriesLast([...ids], seriesIds);
}

/** What "Update website" would change for this event, without changing anything. */
export async function previewEventOnWebsite(env, id) {
  const event = await getEvent(env, id);
  const ids = await eventDocumentIds(env, event);
  const { entries } = await getReleaseDiff(env);
  const plan = planRelease(entries, ids);
  const wanted = new Set([...plan.writes, ...plan.deletes]);
  return {
    event,
    entries: entries.filter((entry) => wanted.has(entry.id)),
    included: plan.included,
  };
}

/**
 * "Update website" for one event: bring the drafts up to date from ops, then
 * publish only this event's documents (and anything they need).
 * The site pages follow on the next automatic update.
 */
export async function putEventOnWebsite(env, id) {
  // Saving already staged it; only stage again if the drafts are behind ops.
  const current = await getEvent(env, id);
  const staged =
    previewBehind(current) ||
    seriesAwaitingDates(current) ||
    galleryBehind(current, await readGalleryStaged(env))
    ? await publishEventPreview(env, id)
    : { event: current, warnings: [] };
  const ids = await eventDocumentIds(env, staged.event);
  const result = await publishRelease(env, { ids });
  const warnings = [...(staged.warnings || []), ...result.warnings];
  try {
    // Everything in scope now matches the website, copied or not, so mark it
    // all: events copied live by the old whole-dataset promote get fixed here.
    await markReleasedInOps(env, [...ids, ...result.written], { deleted: result.deleted });
  } catch (error) {
    warnings.push(`On the website, but ops status did not update: ${error?.message || "unknown error"}.`);
  }
  return {
    event: await withWebsiteStatus(env, await getEvent(env, id)),
    written: result.written,
    deleted: result.deleted,
    included: result.included,
    warnings,
  };
}

/**
 * Delete an event in ops (#23). One with nothing on the website goes at once.
 * One that is live stays there until Update website, like a dropped night:
 * its drafts are marked `removed`, its calendar entries go, and ops hides it
 * (Deleted at) with Restore on the Website page until it is published.
 */
export async function deleteEventFromOps(env, id, { query = sanityQuery, mutate = sanityMutate } = {}) {
  const event = await getEvent(env, id);
  const ids = await eventDocumentIds(env, event, { query });
  // Nights before the series: Sanity won't let a series go while nights refer to it.
  const { warnings, live } = await markNightsRemoved(
    env,
    ids.map((sanityId) => ({ sanityId })),
    { query, mutate },
  );
  if (!live.size) {
    await deleteEvent(env, id);
    return { pending: false, warnings };
  }
  warnings.push(...(await settleDroppedRows(env, event.dates || [], live)));
  await setEventDeletedAt(env, id, new Date().toISOString());
  return { pending: true, warnings };
}

/** Undo a delete that hasn't reached the website: the preview gets the event back. */
export async function restoreEvent(env, id) {
  await setEventDeletedAt(env, id, "");
  return publishEventPreview(env, id);
}

const EVENT_DOCS_QUERY = `*[_type in ["eventSeries", "event"] && !(_id in path("drafts.**"))]`;

/**
 * "Is this event on the website?" from the real data: every one of its
 * documents (series + nights) on the preview, which saving keeps in step
 * with ops, compared with what the website shows. Fingerprints in ops only cover the fields
 * someone remembered to list; this cannot miss one.
 *  - nothing staged yet: keep ops' own answer (an ended series with every
 *    night marked removed still has its series document staged)
 *  - nothing live: "unpublished"
 *  - any document added, removed or different: "stale"
 */
export function websiteStatusFor(event, preview, production) {
  const { slugs, seriesIds } = seriesKeys(event);
  const belongs = (doc) =>
    seriesIds.includes(doc._id) || (doc._type === "event" && slugs.includes(doc.seriesId));
  // A night marked removed is gone from the preview, still on the website.
  const onPreview = [...preview.values()].filter((doc) => belongs(doc) && doc.removed !== true);
  if (!onPreview.length) return event.publish?.live || "unpublished";
  const live = [...production.values()].filter(belongs);
  if (!live.length) return "unpublished";
  if (live.length !== onPreview.length) return "stale";
  for (const doc of onPreview) {
    const other = production.get(doc._id);
    // Compared as Update website writes them: a draft's weak references count
    // as the strong ones they become on publish (#56).
    if (!other || stableStringify(releaseDocument(other)) !== stableStringify(releaseDocument(doc))) {
      return "stale";
    }
  }
  return "current";
}

/** Replace publish.live with the real-data answer. */
export async function withWebsiteStatus(env, events, { query = sanityQuery } = {}) {
  const list = (Array.isArray(events) ? events : [events]).filter(Boolean);
  if (!list.length) return events;
  let preview;
  let production;
  try {
    const [previewDocs, productionDocs] = await Promise.all([
      query(env, PREVIEW, EVENT_DOCS_QUERY),
      query(env, "production", EVENT_DOCS_QUERY),
    ]);
    preview = new Map((previewDocs || []).map((doc) => [doc._id, doc]));
    production = new Map((productionDocs || []).map((doc) => [doc._id, doc]));
  } catch {
    return events; // Sanity unreachable: ops' own status is better than none.
  }
  const apply = (event) => ({
    ...event,
    publish: { ...event.publish, live: websiteStatusFor(event, preview, production) },
  });
  return Array.isArray(events) ? list.map(apply) : apply(events);
}
