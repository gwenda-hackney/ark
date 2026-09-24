import { itemSlug } from "./item-key.js";
import {
  parseNightSchedule,
  stableNightSchedule,
  toSanityNightSchedule,
} from "./night-schedule.js";

export function seriesSlug(name) {
  return itemSlug(name);
}

export function occurrenceSlug(series, date) {
  const base = seriesSlug(series) || "event";
  return `${base}-${date}`;
}

export function sanityEventId(slug) {
  return `event-${slug}`;
}

export function sanitySeriesId(slug) {
  return `series-${String(slug || "").trim()}`;
}

export function seriesScheduleMode(event) {
  const unit = String(event?.repeatUnit || "none")
    .trim()
    .toLowerCase();
  if (unit === "once") return "once";
  return unit && unit !== "none" ? "repeating" : "manual";
}

export function plainToEventDescription(text) {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const blocks = [];
  let paragraph = [];

  const inlineChildren = (value, blockIndex) => {
    const children = [];
    const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
    let cursor = 0;
    let match;
    while ((match = pattern.exec(value))) {
      if (match.index > cursor) {
        children.push({
          _type: "span",
          _key: `s${blockIndex}-${children.length}`,
          text: value.slice(cursor, match.index),
          marks: [],
        });
      }
      const strong = match[0].startsWith("**");
      children.push({
        _type: "span",
        _key: `s${blockIndex}-${children.length}`,
        text: match[0].slice(strong ? 2 : 1, strong ? -2 : -1),
        marks: [strong ? "strong" : "em"],
      });
      cursor = match.index + match[0].length;
    }
    if (cursor < value.length || !children.length) {
      children.push({
        _type: "span",
        _key: `s${blockIndex}-${children.length}`,
        text: value.slice(cursor),
        marks: [],
      });
    }
    return children;
  };

  const addBlock = (value, options = {}) => {
    const cleaned = String(value || "").trim();
    if (!cleaned) return;
    const index = blocks.length;
    blocks.push({
      _type: "block",
      _key: `p${index}`,
      style: options.style || "normal",
      ...(options.listItem ? { listItem: options.listItem, level: 1 } : {}),
      markDefs: [],
      children: inlineChildren(cleaned, index),
    });
  };

  const flushParagraph = () => {
    if (!paragraph.length) return;
    addBlock(paragraph.join("\n"));
    paragraph = [];
  };

  for (const line of lines) {
    const heading = line.match(/^\s*(#{1,3})\s+(.+?)\s*$/);
    const bullet = line.match(/^\s*[-*]\s+(.+?)\s*$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+?)\s*$/);
    if (heading) {
      flushParagraph();
      addBlock(heading[2], { style: `h${heading[1].length}` });
    } else if (bullet || numbered) {
      flushParagraph();
      addBlock((bullet || numbered)[1], {
        listItem: bullet ? "bullet" : "number",
      });
    } else if (!line.trim()) {
      flushParagraph();
    } else {
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  return blocks;
}

function occurrenceRow(event, occurrence) {
  if (occurrence && typeof occurrence === "object") return occurrence;
  return (event?.dates || []).find((row) => row.date === occurrence) || null;
}

/**
 * A special guest night is one with its own DJ / guest artist.
 * A flyer image alone is not a special edition.
 */
export function occurrenceIsSpecialEdition(event, occurrence) {
  const overrides = occurrenceRow(event, occurrence)?.overrides || {};
  const artist = String(overrides.artist || "").trim();
  if (!artist) return false;
  return artist !== String(event?.artist || "").trim();
}

function onceNightOverrides(event) {
  if (String(event?.repeatUnit || "").toLowerCase() !== "once") return null;
  const nights = Array.isArray(event?.dates) ? event.dates : [];
  return nights.find((night) => night?.overrides)?.overrides || null;
}

/** Series copy, or the one night's copy when a one-off was edited as that night. */
export function seriesDescriptionForPublish(event) {
  const own = String(event?.description || "").trim();
  if (own) return own;
  return String(onceNightOverrides(event)?.description || "").trim();
}

export function seriesShortDescriptionForPublish(event) {
  const own = String(event?.shortDescription || "").trim();
  if (own) return own;
  return String(onceNightOverrides(event)?.shortDescription || "").trim();
}

/** A one-off replaces a series only when this is that series slug. `keep:` means both nights stay. */
export function publishedReplacesSeries(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.startsWith("keep:")) return "";
  return raw;
}

export function resolveOccurrenceContent(event, occurrence) {
  const row = occurrenceRow(event, occurrence);
  const overrides = row?.overrides || {};
  const once = String(event?.repeatUnit || "").toLowerCase() === "once";
  return {
    title: String(overrides.name || event?.name || "").trim(),
    artist: String(overrides.artist || event?.artist || "").trim(),
    offer: String(overrides.offer || event?.offer || "").trim(),
    pageUrl: String(event?.pageUrl || "").trim(),
    description: once
      ? seriesDescriptionForPublish(event)
      : String(overrides.description || event?.description || "").trim(),
    shortDescription: once
      ? seriesShortDescriptionForPublish(event)
      : String(overrides.shortDescription || "").trim(),
    time: String(overrides.time || event?.time || "").trim(),
    startTime: String(overrides.startTime || event?.startTime || "").trim(),
    endTime: String(overrides.endTime || event?.endTime || "").trim(),
    nightSchedule: Array.isArray(overrides.nightSchedule)
      ? stableNightSchedule(overrides.nightSchedule)
      : stableNightSchedule(event?.nightSchedule),
    operationsNotes: String(
      overrides.operationsNotes || event?.operationsNotes || "",
    ).trim(),
    imageLinks:
      overrides.imageLinks?.length > 0
        ? overrides.imageLinks
        : event?.imageLinks || [],
    image: overrides.image || event?.mainImage || null,
    isSpecialEdition: occurrenceIsSpecialEdition(event, row),
  };
}

/**
 * Night title override, or empty when it only echoes the series name.
 * Keeps rename free: renaming the series updates every inherited night.
 */
export function titleOverrideForSave(seriesName, title) {
  const series = String(seriesName || "").trim();
  const value = String(title || "").trim();
  if (!value) return "";
  if (!series) return value;
  if (value.toLowerCase() === series.toLowerCase()) return "";
  return value;
}

/** True when a stored title override is only the previous series name. */
export function titleOverrideEchoesSeries(seriesName, titleOverride) {
  const series = String(seriesName || "").trim();
  const value = String(titleOverride || "").trim();
  if (!series || !value) return false;
  return value.toLowerCase() === series.toLowerCase();
}

/** Stable file identity: Baserow URLs rotate signed query tokens. */
export function stableImageRef(image) {
  if (!image) return "";
  const name = String(image.name || image.visible_name || "").trim();
  if (name) return `name:${name}`;
  const url = String(image.url || "").trim();
  if (!url) return "";
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return `url:${parsed.toString()}`;
  } catch {
    return `url:${url.split(/[?#]/)[0]}`;
  }
}

function roundFrac(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(1, Math.max(0, n)) * 1e6) / 1e6;
}

/** Stable crop+hotspot shape so key order / float noise cannot keep preview stale. */
export function stableHeroFraming(value) {
  if (!value || typeof value !== "object") return null;
  const source =
    value.crop || value.main || value.card ? value : { crop: value };
  const cropSrc = source.crop || source.main || source.card || {};
  const left = roundFrac(cropSrc.left);
  const top = roundFrac(cropSrc.top);
  const right = roundFrac(cropSrc.right);
  const bottom = roundFrac(cropSrc.bottom);
  if (!left && !top && !right && !bottom) return null;
  const hotspotSrc = source.hotspot || {};
  const width = Math.max(0.05, 1 - left - right);
  const height = Math.max(0.05, 1 - top - bottom);
  return {
    crop: { left, top, right, bottom },
    hotspot: {
      x: roundFrac(hotspotSrc.x != null ? hotspotSrc.x : left + width / 2),
      y: roundFrac(hotspotSrc.y != null ? hotspotSrc.y : top + height / 2),
      width: roundFrac(hotspotSrc.width) || Math.min(0.2, width),
      height: roundFrac(hotspotSrc.height) || Math.min(0.2, height),
    },
  };
}

export function occurrencePayload(event, occurrence) {
  const date = typeof occurrence === "object" ? occurrence?.date : occurrence;
  const row = occurrenceRow(event, occurrence);
  const content = resolveOccurrenceContent(event, occurrence);
  return {
    title: content.title,
    artist: content.artist,
    offer: content.offer,
    pageUrl: content.pageUrl,
    description: content.description,
    time: content.time,
    startTime: content.startTime,
    endTime: content.endTime,
    nightSchedule: content.nightSchedule,
    date,
    image: stableImageRef(content.image),
    seriesImage: stableImageRef(event?.mainImage),
    heroCrops: stableHeroFraming(event?.heroCrops),
    occurrenceHeroCrops: stableHeroFraming(row?.overrides?.heroCrops),
    shortDescription: content.shortDescription || null,
    seriesNightSchedule: stableNightSchedule(event?.nightSchedule),
    isSpecialEdition: content.isSpecialEdition,
    seriesId: String(event?.slug || "").trim(),
    seriesTitle: String(event?.name || "").trim(),
    seriesDescription: String(event?.description || "").trim(),
    seriesSchedule: seriesScheduleMode(event),
    recurrenceLabel: recurrenceLabel(event),
    ...(publishedReplacesSeries(event?.replacesSeries)
      ? { replacesSeriesId: publishedReplacesSeries(event.replacesSeries) }
      : {}),
  };
}

export function occurrenceHash(event, occurrence) {
  return JSON.stringify(occurrencePayload(event, occurrence));
}

const DAY_LABELS = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export function recurrenceLabel(event) {
  const every = Math.max(1, Math.floor(Number(event?.repeatEvery) || 1));
  const unit = String(event?.repeatUnit || "none")
    .trim()
    .toLowerCase();
  if (unit === "once" || unit === "none" || unit === "") return "";
  if (unit === "day") return every === 1 ? "Every day" : `Every ${every} days`;
  if (unit === "week") {
    const days = (event?.weekdays || [])
      .map((day) => DAY_LABELS[String(day).slice(0, 3).toLowerCase()])
      .filter(Boolean);
    if (every === 1 && days.length) return `Every ${days.join(" and ")}`;
    const cadence = every === 1 ? "Every week" : `Every ${every} weeks`;
    return days.length ? `${cadence} on ${days.join(" and ")}` : cadence;
  }
  if (unit === "month") {
    const day = Math.floor(Number(event?.monthDay) || 0);
    const cadence = every === 1 ? "Every month" : `Every ${every} months`;
    return day ? `${cadence} on day ${day}` : cadence;
  }
  return "";
}

const RSVP_BODY = `{greeting}

Thanks for replying. {guests_line}

{event_block}

Open your ticket link below to view your pass, add it to Apple Wallet, or save the date to your calendar.

Need to change your reply? {modify_url}`;

export function sanitySeriesDocument({
  slug,
  title,
  description,
  shortDescription,
  recurrence,
  schedule,
  replacesSeriesId,
  nightSchedule,
  heroImage,
}) {
  const key = String(slug || "").trim();
  const doc = {
    _id: sanitySeriesId(key),
    _type: "eventSeries",
    title: String(title || "").trim(),
    slug: { _type: "slug", current: key },
    schedule:
      schedule === "repeating" ? "repeating" : schedule === "once" ? "once" : "manual",
    recurrence: String(recurrence || "").trim(),
    replacesSeriesId: String(replacesSeriesId || "").trim(),
    shortDescription: String(shortDescription || "").trim(),
    description: plainToEventDescription(description),
    nightSchedule: toSanityNightSchedule(nightSchedule),
  };
  if (heroImage) doc.heroImage = heroImage;
  return doc;
}

export function sanityEventDocument({
  slug,
  title,
  date,
  description,
  shortDescription,
  artist,
  offer,
  pageUrl,
  heroImage,
  seriesHeroImage,
  seriesId,
  seriesTitle,
  recurrence,
  time,
  startTime,
  endTime,
  nightSchedule,
  isSpecialEdition,
}) {
  const seriesKey = String(seriesId || "").trim();
  const doc = {
    _id: sanityEventId(slug),
    _type: "event",
    title,
    slug: { _type: "slug", current: slug },
    eventType: "public",
    seriesId: seriesKey,
    seriesTitle: String(seriesTitle || "").trim(),
    recurrence,
    isSpecialEdition: Boolean(isSpecialEdition),
    date,
    time,
    offer,
    pageUrl: String(pageUrl || "").trim(),
    shortDescription: String(shortDescription || "").trim(),
    description: plainToEventDescription(description),
    venue: "Schwartz Wharf, Hackney Wick, London E9 5AA",
    ticketStart: startTime || "17:00",
    ticketEnd: endTime || "",
    nightSchedule: toSanityNightSchedule(nightSchedule),
    channels: [],
    rsvpConfirmation: {
      subject: "You're on the list · Gwenda",
      eyebrow: "You're on the list",
      heading: "See you there",
      body: RSVP_BODY,
    },
  };
  if (seriesKey) {
    doc.series = { _type: "reference", _ref: sanitySeriesId(seriesKey) };
  }
  const artistText = String(artist || "").trim();
  if (artistText) doc.artist = artistText;
  if (heroImage) doc.heroImage = heroImage;
  if (seriesHeroImage) doc.seriesHeroImage = seriesHeroImage;
  return doc;
}
