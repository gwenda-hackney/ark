import { sanityQuery } from "./sanity-query.js";
import { portableTextToPlain } from "./portable-text.js";
import {
  resolveHeroUrl,
  resolveSeriesHeroUrl,
  objectPositionFromHotspot,
} from "./sanity-image-url.js";

const EVENTS_LIST_QUERY = `*[_type == "event" && coalesce(eventType, "public") == "public"] | order(date asc) {
  "id": slug.current,
  title,
  artist,
  offer,
  seriesId,
  seriesTitle,
  recurrence,
  isSpecialEdition,
  time,
  "startTime": ticketStart,
  "endTime": ticketEnd,
  date,
  shortDescription,
  nightSchedule[]{ label, startTime, endTime },
  description,
  "heroAssetUrl": heroImage.asset->url,
  "heroCrop": heroImage.crop,
  "heroHotspot": heroImage.hotspot,
  "heroDimensions": heroImage.asset->metadata.dimensions,
  "seriesHeroAssetUrl": seriesHeroImage.asset->url,
  "seriesHeroCrop": seriesHeroImage.crop,
  "seriesHeroHotspot": seriesHeroImage.hotspot,
  "seriesHeroDimensions": seriesHeroImage.asset->metadata.dimensions
}`;

const SERIES_LIST_QUERY = `*[_type == "eventSeries"] | order(title asc) {
  "id": slug.current,
  title,
  schedule,
  recurrence,
  replacesSeriesId,
  shortDescription,
  nightSchedule[]{ label, startTime, endTime },
  description,
  "heroAssetUrl": heroImage.asset->url,
  "heroCrop": heroImage.crop,
  "heroHotspot": heroImage.hotspot,
  "heroDimensions": heroImage.asset->metadata.dimensions
}`;

export async function fetchPublishedEvents(env) {
  const rows = (await sanityQuery(env, EVENTS_LIST_QUERY)) ?? [];

  return rows
    .filter((row) => row?.id && row?.title && row?.date && row?.description)
    .map((row) => ({
      id: row.id,
      title: row.title,
      artist: row.artist || "",
      offer: row.offer || "",
      seriesId: row.seriesId || row.id,
      seriesTitle: row.seriesTitle || "",
      recurrence: row.recurrence || "",
      isSpecialEdition: Boolean(row.isSpecialEdition),
      time: row.time || "",
      startTime: row.startTime || "",
      endTime: row.endTime || "",
      date: row.date,
      shortDescription: String(row.shortDescription || "").trim(),
      nightSchedule: Array.isArray(row.nightSchedule)
        ? row.nightSchedule
            .map((slot) => ({
              label: String(slot?.label || "").trim(),
              startTime: String(slot?.startTime || "").trim(),
              endTime: String(slot?.endTime || "").trim(),
            }))
            .filter((slot) => slot.label)
        : [],
      description: portableTextToPlain(row.description),
      heroImageUrl: resolveHeroUrl(row),
      heroObjectPosition: objectPositionFromHotspot(
        row.heroHotspot,
        row.heroCrop,
      ),
      seriesHeroImageUrl: resolveSeriesHeroUrl(row),
      seriesHeroObjectPosition: objectPositionFromHotspot(
        row.seriesHeroHotspot,
        row.seriesHeroCrop,
      ),
    }));
}

export async function fetchPublishedSeries(env) {
  const rows = (await sanityQuery(env, SERIES_LIST_QUERY)) ?? [];
  return rows
    .filter((row) => row?.id && row?.title)
    .map((row) => ({
      seriesId: row.id,
      title: row.title,
      schedule:
        row.schedule === "repeating"
          ? "repeating"
          : row.schedule === "once"
            ? "once"
            : "manual",
      replacesSeriesId: String(row.replacesSeriesId || "").trim(),
      recurrence: row.recurrence || "",
      shortDescription: String(row.shortDescription || "").trim(),
      nightSchedule: Array.isArray(row.nightSchedule)
        ? row.nightSchedule
            .map((slot) => ({
              label: String(slot?.label || "").trim(),
              startTime: String(slot?.startTime || "").trim(),
              endTime: String(slot?.endTime || "").trim(),
            }))
            .filter((slot) => slot.label)
        : [],
      description: portableTextToPlain(row.description),
      heroImageUrl: resolveHeroUrl(row),
      heroObjectPosition: objectPositionFromHotspot(
        row.heroHotspot,
        row.heroCrop,
      ),
    }));
}

export async function fetchPublishedCatalog(env) {
  const [occurrences, series] = await Promise.all([
    fetchPublishedEvents(env),
    fetchPublishedSeries(env),
  ]);
  return { occurrences, series };
}
