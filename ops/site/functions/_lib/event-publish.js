/**
 * Event preview writes the staging dataset. The staging diary reads that live,
 * so a preview does not rebuild the site. A full site publish is separate.
 * Push live copies this event's documents onto production.
 */
import {
  EDITORIAL_DATASET,
  sanityMutate,
  sanityMutateProduction,
  sanityQuery,
  sanityUploadImage,
  sanityUploadImageProduction,
} from "./sanity.js";
import { siteEnvName } from "./config-store.js";
import { dispatchStagingContentDeploy } from "./site-deploy.js";
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

function documentFromStaging(doc, heroImage, seriesHeroImage) {
  const next = {
    _id: doc._id,
    _type: "event",
    title: doc.title,
    slug: doc.slug,
    eventType: doc.eventType || "public",
    seriesId: doc.seriesId || doc.slug?.current || doc._id,
    seriesTitle: doc.seriesTitle || "",
    recurrence: doc.recurrence || "",
    isSpecialEdition: Boolean(doc.isSpecialEdition),
    date: doc.date,
    time: doc.time || "",
    offer: doc.offer || "",
    pageUrl: doc.pageUrl || "",
    shortDescription: doc.shortDescription || "",
    description: doc.description,
    venue: doc.venue,
    ticketStart: doc.ticketStart,
    ticketEnd: doc.ticketEnd,
    nightSchedule: Array.isArray(doc.nightSchedule) ? doc.nightSchedule : [],
    channels: doc.channels || [],
    rsvpConfirmation: doc.rsvpConfirmation,
  };
  if (doc.artist) next.artist = doc.artist;
  if (doc.series) next.series = doc.series;
  if (heroImage) next.heroImage = heroImage;
  if (seriesHeroImage) next.seriesHeroImage = seriesHeroImage;
  return next;
}

function documentFromStagingSeries(doc, heroImage) {
  const next = {
    _id: doc._id,
    _type: "eventSeries",
    title: doc.title,
    slug: doc.slug,
    schedule:
      doc.schedule === "repeating"
        ? "repeating"
        : doc.schedule === "once"
          ? "once"
          : "manual",
    recurrence: doc.recurrence || "",
    replacesSeriesId: doc.replacesSeriesId || "",
    shortDescription: doc.shortDescription || "",
    description: doc.description,
    nightSchedule: Array.isArray(doc.nightSchedule) ? doc.nightSchedule : [],
  };
  if (heroImage) next.heroImage = heroImage;
  return next;
}

export async function publishEventPreview(
  env,
  id,
  { deploy: triggerDeploy = false } = {},
) {
  const event = await getEvent(env, id);
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
  for (const row of drop) {
    if (row.sanityId) {
      try {
        await sanityMutate(env, EDITORIAL_DATASET, [
          { delete: { id: row.sanityId } },
        ]);
      } catch (error) {
        warnings.push(
          error?.message ||
            `Could not remove ${row.date} from the preview site.`,
        );
      }
      if (row.snapshots?.production?.hash) {
        try {
          await sanityMutateProduction(env, [{ delete: { id: row.sanityId } }]);
        } catch (error) {
          warnings.push(
            error?.message ||
              `Could not remove ${row.date} from the live site.`,
          );
        }
      }
    }
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

  let deployed = false;
  let deploy = null;
  if (triggerDeploy && siteEnvName(env) !== "local") {
    try {
      deploy = await dispatchStagingContentDeploy(env);
      deployed = true;
    } catch (error) {
      warnings.push(error?.message || "Preview site rebuild did not start.");
    }
  }

  return {
    event: await getEvent(env, id),
    warnings,
    deployed,
    deploy,
    target: "staging",
  };
}

export async function publishAllEventPreviews(env) {
  const source = await listEvents(env);
  const published = [];
  const failed = [];
  const skipped = [];
  const warnings = [];

  for (const event of source) {
    if (event.publish?.preview === "current") {
      skipped.push({ id: event.id, name: event.name });
      continue;
    }
    try {
      const result = await publishEventPreview(env, event.id, {
        deploy: false,
      });
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

  return {
    events: await listEvents(env),
    published,
    failed,
    skipped,
    warnings,
    deployed: false,
    deploy: null,
    target: "staging",
  };
}

const STAGING_EVENT_QUERY = `*[_id == $id][0]{
  _id, _type, title, slug, eventType, seriesId, series, seriesTitle, recurrence, isSpecialEdition,
  date, description, artist, venue,
  time, offer, pageUrl, ticketStart, ticketEnd, nightSchedule, channels, rsvpConfirmation,
  heroImage {
    alt,
    crop,
    hotspot,
    "url": asset->url
  },
  seriesHeroImage {
    alt,
    crop,
    hotspot,
    "url": asset->url
  }
}`;

const STAGING_SERIES_QUERY = `*[_id == $id][0]{
  _id, _type, title, slug, schedule, recurrence, shortDescription, description, nightSchedule,
  heroImage {
    alt,
    crop,
    hotspot,
    "url": asset->url
  }
}`;

export async function publishEventLive(env, id) {
  const event = await getEvent(env, id);
  if (event.publish.preview !== "current") {
    httpError("Update the preview site before pushing live.", 409);
  }
  const today = todayIso();
  const wanted = new Set(event.publish.previewDates);
  const warnings = [];

  const seriesId = sanitySeriesId(event.slug);
  const seriesDoc = await sanityQuery(
    env,
    EDITORIAL_DATASET,
    STAGING_SERIES_QUERY,
    {
      id: seriesId,
    },
  );
  if (seriesDoc?._id) {
    let seriesHero = await imageFromUrl(
      seriesDoc.heroImage?.url,
      (bytes, meta) => sanityUploadImageProduction(env, bytes, meta),
    );
    if (seriesHero) {
      seriesHero = withImageCrop(
        {
          ...seriesHero,
          alt: seriesDoc.heroImage?.alt || event.name,
        },
        {
          crop: seriesDoc.heroImage?.crop,
          hotspot: seriesDoc.heroImage?.hotspot,
        },
      );
    }
    await sanityMutateProduction(env, [
      { createOrReplace: documentFromStagingSeries(seriesDoc, seriesHero) },
    ]);
  } else {
    warnings.push("Missing preview series document.");
  }

  for (const row of event.dates) {
    if (row.date < today || !wanted.has(row.date) || !row.sanityId) continue;
    const doc = await sanityQuery(env, EDITORIAL_DATASET, STAGING_EVENT_QUERY, {
      id: row.sanityId,
    });
    if (!doc?._id) {
      warnings.push(`Missing preview document for ${row.date}.`);
      continue;
    }
    let hero = await imageFromUrl(doc.heroImage?.url, (bytes, meta) =>
      sanityUploadImageProduction(env, bytes, meta),
    );
    if (hero) {
      hero = withImageCrop(
        {
          ...hero,
          alt: doc.heroImage?.alt || event.name,
        },
        {
          crop: doc.heroImage?.crop,
          hotspot: doc.heroImage?.hotspot,
        },
      );
    }
    let seriesHero = await imageFromUrl(
      doc.seriesHeroImage?.url,
      (bytes, meta) => sanityUploadImageProduction(env, bytes, meta),
    );
    if (seriesHero) {
      seriesHero = withImageCrop(
        {
          ...seriesHero,
          alt: doc.seriesHeroImage?.alt || event.name,
        },
        {
          crop: doc.seriesHeroImage?.crop,
          hotspot: doc.seriesHeroImage?.hotspot,
        },
      );
    }
    await sanityMutateProduction(env, [
      { createOrReplace: documentFromStaging(doc, hero, seriesHero) },
    ]);
    await saveOccurrence(env, id, {
      ...row,
      label: `${event.name} · ${row.date}`,
      snapshots: {
        ...row.snapshots,
        production: {
          hash: occurrenceHash(event, row),
          at: new Date().toISOString(),
        },
      },
    });
  }
  return {
    event: await getEvent(env, id),
    warnings,
    deployed: false,
    target: "production",
  };
}

export async function unpublishEvent(env, event) {
  return unpublishOccurrences(env, event?.dates || []);
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
        error?.message || `Could not remove ${row.date} from the preview site.`,
      );
    }
    if (row.snapshots?.production?.hash) {
      try {
        await sanityMutateProduction(env, [{ delete: { id: row.sanityId } }]);
      } catch (error) {
        warnings.push(
          error?.message || `Could not remove ${row.date} from the live site.`,
        );
      }
    }
  }
  return warnings;
}
