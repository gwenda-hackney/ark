/**
 * Saving an event stages it: its series and nights are written to the staging
 * dataset. What's on reads that live; the rest of the preview site updates on
 * its own once edits go quiet (site-pending.js).
 * Production only changes from Website > Staging → live, never from here.
 * Local ops writes drafts instead (see sanity.js), so dev never touches staging.
 */
import {
  EDITORIAL_DATASET,
  sanityMutate,
  sanityMutateProduction,
  sanityQuery,
  sanityUploadImage,
} from "./sanity.js";
import {
  getReleaseDiff,
  markReleasedInOps,
  planRelease,
  publishRelease,
} from "./release.js";
import { siteEnvName } from "./config-store.js";
import { documentFingerprint } from "../../../../shared/site-snapshot.js";
import {
  expandOccurrenceDates,
  expandSeriesOccurrenceDates,
  todayIso,
} from "./event-recurrence.js";
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
  seriesScheduleMode,
} from "./event-content.js";
import {
  getEvent,
  hasShortDescriptionOverrideColumn,
  listEvents,
  removeOccurrence,
  saveOccurrence,
} from "./event-store.js";
import { syncSocialTasks } from "./event-tasks.js";

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

async function imageFromUrl(url, upload) {
  if (!url) return undefined;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    httpError("Could not read the main image.", 502);
  }
  const bytes = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "image/jpeg";
  const asset = await upload(bytes, { filename: "event.jpg", contentType });
  if (!asset?._id) return undefined;
  return {
    _type: "image",
    alt: "",
    asset: { _type: "reference", _ref: asset._id },
  };
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

export async function publishEventPreview(
  env,
  id,
  _options = {},
) {
  const event = await getEvent(env, id);
  // Series and night pages are built ahead of time; the diary is read live.
  let pagesChanged = !event.dates.some((row) => row.snapshots?.staging);
  if (!event.name) httpError("Name is required.", 400);
  const description = seriesDescriptionForPublish(event);
  const shortDescription = seriesShortDescriptionForPublish(event);
  if (!description)
    httpError("Description is required before publishing.", 400);
  const today = todayIso();
  const wanted = expandOccurrenceDates(event, { today });
  if (!wanted.length) httpError("There is no upcoming date to publish.", 400);

  const existingByDate = new Map(event.dates.map((row) => [row.date, row]));
  const heroByUrl = new Map();
  const occurrences = [];
  const mutations = [];

  const seriesImageUrl = event.mainImage?.url || "";
  let seriesHero;
  if (seriesImageUrl) {
    const uploaded = await imageFromUrl(seriesImageUrl, (bytes, meta) =>
      sanityUploadImage(env, EDITORIAL_DATASET, bytes, meta),
    );
    seriesHero = withImageCrop(
      uploaded ? { ...uploaded, alt: event.name } : uploaded,
      framingFromEvent(event),
    );
    if (seriesHero && !seriesHero.alt) {
      seriesHero = { ...seriesHero, alt: event.name };
    }
    heroByUrl.set(`series:${seriesImageUrl}`, seriesHero);
  }
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
          EDITORIAL_DATASET,
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
    if (previous?.sanityId && previous?.snapshots?.staging?.hash === hash) {
      occurrences.push({
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
    const slug = occurrenceSlug(event.slug, date);
    const imageUrl = content.image?.url || "";
    let hero = heroByUrl.get(imageUrl);
    if (imageUrl && !heroByUrl.has(imageUrl)) {
      hero = await imageFromUrl(imageUrl, (bytes, meta) =>
        sanityUploadImage(env, EDITORIAL_DATASET, bytes, meta),
      );
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
        staging: {
          hash,
          at: new Date().toISOString(),
        },
      },
    });
  }
  for (let i = 0; i < mutations.length; i += 25) {
    await sanityMutate(env, EDITORIAL_DATASET, mutations.slice(i, i + 25));
  }

  const warnings = [];
  const materialized = new Set(expandSeriesOccurrenceDates(event));
  const drop = event.dates.filter(
    (row) => row.date >= today && !materialized.has(row.date),
  );
  if (drop.length) pagesChanged = true;
  warnings.push(...(await unpublishOccurrences(env, drop)));
  for (const row of drop) {
    if (row.id) await removeOccurrence(env, row.id);
  }

  const tasks =
    siteEnvName(env) === "local"
      ? { dates: occurrences, warnings: [] }
      : await syncSocialTasks(env, event, occurrences);
  warnings.push(...tasks.warnings);
  for (const occurrence of tasks.dates) {
    await saveOccurrence(env, id, occurrence);
  }

  // No build here: the site updates once edits go quiet (site-pending.js).
  const deployed = false;
  const deploy = null;

  return {
    event: await getEvent(env, id),
    warnings,
    deployed,
    deploy,
    pagesChanged,
    target: "staging",
  };
}

/**
 * Stage after a save. A save always succeeds on its own; staging problems
 * (no description yet, no upcoming date) come back as `staging.error`.
 */
export async function stageEvent(env, id) {
  try {
    const result = await publishEventPreview(env, id);
    return {
      event: await withWebsiteStatus(env, result.event),
      staging: {
        ok: true,
        local: siteEnvName(env) === "local",
        warnings: result.warnings,
        deployed: result.deployed,
        deploy: result.deploy,
      },
    };
  } catch (error) {
    return {
      event: null,
      staging: {
        ok: false,
        local: siteEnvName(env) === "local",
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
    target: "staging",
  };
}

/** Removes from staging only. Website > Staging → live carries the removal to production. */
export async function unpublishEvent(env, event) {
  const warnings = await unpublishOccurrences(env, event?.dates || []);
  if (event?.slug) {
    try {
      await sanityMutate(env, EDITORIAL_DATASET, [
        { delete: { id: sanitySeriesId(event.slug) } },
      ]);
    } catch (error) {
      warnings.push(error?.message || "Could not remove the series from staging.");
    }
  }
  return warnings;
}

export async function unpublishOccurrences(env, rows) {
  const warnings = [];
  for (const row of rows || []) {
    if (!row?.sanityId) continue;
    try {
      await sanityMutate(env, EDITORIAL_DATASET, [
        { delete: { id: row.sanityId } },
      ]);
    } catch (error) {
      warnings.push(
        error?.message || `Could not remove ${row.date} from staging.`,
      );
    }
  }
  return warnings;
}

/**
 * Every published document that belongs to this event, on either side: the
 * series and each night (including nights removed in ops but still live).
 */
export async function eventDocumentIds(env, event, { query = sanityQuery } = {}) {
  const seriesId = sanitySeriesId(event.slug);
  const groq = `*[!(_id in path("drafts.**")) && (_id == $seriesId || (_type == "event" && seriesId == $slug))]._id`;
  const params = { seriesId, slug: event.slug };
  const [staging, production] = await Promise.all([
    query(env, EDITORIAL_DATASET, groq, params),
    query(env, "production", groq, params),
  ]);
  const ids = new Set([seriesId, ...(staging || []), ...(production || [])]);
  for (const row of event.dates || []) if (row.sanityId) ids.add(row.sanityId);
  return [...ids];
}

/** What "Put on website" would change for this event, without changing anything. */
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
 * "Put on website" for one event: bring staging up to date from ops, then
 * copy only this event's documents (and anything they need) to production.
 * The site pages follow on the next automatic update.
 */
export async function putEventOnWebsite(env, id) {
  const staged = await publishEventPreview(env, id);
  const ids = await eventDocumentIds(env, staged.event);
  const result = await publishRelease(env, { ids });
  const warnings = [...(staged.warnings || []), ...result.warnings];
  try {
    // Everything in scope now matches the website, copied or not, so mark it
    // all: events copied live by the old whole-dataset promote get fixed here.
    await markReleasedInOps(env, [...ids, ...result.written]);
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

/** Take an event's documents off the live site (delete with "also take it off the website"). */
export async function removeEventFromWebsite(env, event, rows = null) {
  const ids = rows
    ? rows.map((row) => row.sanityId).filter(Boolean)
    : await eventDocumentIds(env, event);
  const warnings = [];
  for (const docId of ids) {
    try {
      await sanityMutateProduction(env, [{ delete: { id: docId } }]);
    } catch (error) {
      warnings.push(`Could not take ${docId} off the website: ${error?.message || "unknown error"}.`);
    }
  }
  return warnings;
}

const EVENT_DOCS_QUERY = `*[_type in ["eventSeries", "event"] && !(_id in path("drafts.**"))]`;

/**
 * "Is this event on the website?" from the real data: every one of its
 * documents (series + nights) on staging, which saving keeps in step with
 * ops, compared with production. Fingerprints in ops only cover the fields
 * someone remembered to list; this cannot miss one.
 *  - nothing staged yet: keep ops' own answer
 *  - nothing live: "unpublished"
 *  - any document added, removed or different: "stale"
 */
export function websiteStatusFor(event, staging, production) {
  const seriesId = sanitySeriesId(event.slug);
  const belongs = (doc) =>
    doc._id === seriesId || (doc._type === "event" && doc.seriesId === event.slug);
  const onStaging = [...staging.values()].filter(belongs);
  if (!onStaging.length) return event.publish?.live || "unpublished";
  const live = [...production.values()].filter(belongs);
  if (!live.length) return "unpublished";
  if (live.length !== onStaging.length) return "stale";
  for (const doc of onStaging) {
    const other = production.get(doc._id);
    if (!other || documentFingerprint(other) !== documentFingerprint(doc)) return "stale";
  }
  return "current";
}

/** Replace publish.live with the real-data answer. Local ops keeps its own. */
export async function withWebsiteStatus(env, events, { query = sanityQuery } = {}) {
  const list = (Array.isArray(events) ? events : [events]).filter(Boolean);
  if (!list.length || siteEnvName(env) === "local") return events;
  let staging;
  let production;
  try {
    const [stagingDocs, productionDocs] = await Promise.all([
      query(env, EDITORIAL_DATASET, EVENT_DOCS_QUERY),
      query(env, "production", EVENT_DOCS_QUERY),
    ]);
    staging = new Map((stagingDocs || []).map((doc) => [doc._id, doc]));
    production = new Map((productionDocs || []).map((doc) => [doc._id, doc]));
  } catch {
    return events; // Sanity unreachable: ops' own status is better than none.
  }
  const apply = (event) => ({
    ...event,
    publish: { ...event.publish, live: websiteStatusFor(event, staging, production) },
  });
  return Array.isArray(events) ? list.map(apply) : apply(events);
}
