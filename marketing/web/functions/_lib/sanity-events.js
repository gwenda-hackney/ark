import { sanityQuery } from "./sanity-query.js";
import { portableTextToRich } from "./rich-text.js";
import { categoryOf } from "../../src/lib/promotions.js";
import {
  resolveHeroUrl,
  resolveSeriesHeroUrl,
  objectPositionFromHotspot,
} from "./sanity-image-url.js";

const EVENTS_LIST_QUERY = `*[_type == "event" && coalesce(eventType, "public") == "public" && removed != true] | order(date asc) {
  "id": slug.current,
  title,
  artist,
  offer,
  pageUrl,
  seriesId,
  seriesTitle,
  category,
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
  "heroFit": heroImage.fit,
  "heroDimensions": heroImage.asset->metadata.dimensions,
  "seriesHeroAssetUrl": seriesHeroImage.asset->url,
  "seriesHeroCrop": seriesHeroImage.crop,
  "seriesHeroHotspot": seriesHeroImage.hotspot,
  "seriesHeroFit": seriesHeroImage.fit,
  "seriesHeroDimensions": seriesHeroImage.asset->metadata.dimensions
}`;

const SERIES_LIST_QUERY = `*[_type == "eventSeries"] | order(title asc) {
  "id": slug.current,
  formerSlugs,
  title,
  category,
  schedule,
  datesPending,
  "gallery": gallery[]{
    date,
    "url": asset->url,
    "width": asset->metadata.dimensions.width,
    "height": asset->metadata.dimensions.height,
    "lqip": asset->metadata.lqip,
    "color": asset->metadata.palette.dominant.background,
    alt
  },
  recurrence,
  replacesSeriesId,
  pageUrl,
  shortDescription,
  nightSchedule[]{ label, startTime, endTime },
  description,
  "heroAssetUrl": heroImage.asset->url,
  "heroCrop": heroImage.crop,
  "heroHotspot": heroImage.hotspot,
  "heroFit": heroImage.fit,
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
      pageUrl: String(row.pageUrl || "").trim(),
      seriesId: row.seriesId || row.id,
      seriesTitle: row.seriesTitle || "",
      category: categoryOf(row),
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
      description: portableTextToRich(row.description),
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
      formerSlugs: Array.isArray(row.formerSlugs) ? row.formerSlugs : [],
      title: row.title,
      // A night, a promotion or a pop-up kitchen (#240).
      category: categoryOf(row),
      schedule:
        row.schedule === "repeating"
          ? "repeating"
          : row.schedule === "once"
            ? "once"
            : "manual",
      replacesSeriesId: String(row.replacesSeriesId || "").trim(),
      // The series' own link from ops: its page elsewhere, or one of our forms.
      pageUrl: String(row.pageUrl || "").trim(),
      datesPending: row.datesPending === true,
      gallery: Array.isArray(row.gallery) ? row.gallery : [],
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
      description: portableTextToRich(row.description),
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
