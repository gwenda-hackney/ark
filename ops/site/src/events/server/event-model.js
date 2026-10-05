/**
 * The events domain (#186): a series, its nights and the rules about them.
 * No I/O and no storage names: records come from and go to the
 * EventRepository (event-repository.js), whatever stores them.
 *
 * EventRecord: { id, name, artist, offer, pageUrl, shortDescription,
 *   description, operationsNotes, imageLinks[], startsOn, time, startTime,
 *   endTime, nightSchedule[], repeatEvery, repeatUnit, weekdays[], monthDay,
 *   endsOn, skippedDates[], extraDates[], slug, formerSlugs[], deletedAt,
 *   takingApplications, replacesSeries, driveFolderId, mainImage, heroCrops,
 *   gallery }
 *
 * gallery: GalleryPhoto[] newest first, or null while the series' gallery is
 * still in Drive (#183, until the backfill moves it). GalleryPhoto:
 *   { key, asset, date ("" for the series, or a night's date), added, source }
 *
 * NightRecord: { id, date, slug, label, sanityId, clickupTaskId, snapshots,
 *   googleCalendarEventId, overrides: { name, artist, offer, pageUrl,
 *   description, shortDescription, time, startTime, endTime, nightSchedule,
 *   operationsNotes, imageLinks[], image, heroCrops } }
 *
 * An image is { asset } (a Sanity image id, #183) or, from before, { name, url }.
 */
import { itemSlug } from "../../menu/item-key.js";
import { parseImageAssetId, sanityImageUrl } from "../../../../../shared/sanity-image.js";
import {
  expandOccurrenceDates,
  expandSeriesOccurrenceDates,
  normalizeExtraDates,
  normalizeSkippedDates,
  normalizeWeekdays,
  parseIsoDate,
  todayIso,
} from "../event-recurrence.js";
import { occurrenceHash, occurrenceIsSpecialEdition, seriesSlug } from "./event-content.js";
import { driveFolderWebUrl } from "../../platform/google-drive.js";
import { parseNightSchedule } from "./night-schedule.js";

export const REPEAT_UNITS = new Set(["none", "once", "day", "week", "month"]);

/** Website paths under /whats-on/ that are pages of their own, not series. */
const RESERVED_SLUGS = new Set(["schedule"]);

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export function text(value) {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  if (typeof value === "object" && value.value != null) return String(value.value).trim();
  return String(value).trim();
}

export function isoDate(value) {
  const raw = text(value).slice(0, 10);
  return parseIsoDate(raw) ? raw : "";
}

export function clockTime(value) {
  const raw = text(value);
  if (!raw) return "";
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function linksFrom(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
  return raw.map((entry) => text(entry)).filter(Boolean);
}

export function slugList(value) {
  return [...new Set(linksFrom(value).map(itemSlug).filter(Boolean))];
}

/** Hero framing: an object, or JSON of one; anything else is no framing. */
export function parseHeroCrops(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** Empty is allowed. Anything else must be an http(s) URL. */
export function normalizePageUrl(value) {
  let raw = text(value);
  if (!raw) return "";
  // "@handle" is an Instagram account; "example.com" means https.
  if (/^@[\w.]+$/.test(raw)) raw = `https://www.instagram.com/${raw.slice(1)}/`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(raw) && raw.includes(".")) raw = `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    parsed = null;
  }
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
    fail("Link must be a website address or an @Instagram handle.");
  }
  return parsed.toString();
}

/** A stored image as it is kept: { asset }, { name } from before, or null. */
export function storedImage(image) {
  if (!image) return null;
  if (parseImageAssetId(image.asset)) return { asset: image.asset };
  const name = text(image.name);
  return name ? { name, url: text(image.url) } : null;
}

/**
 * An image as ops shows it. A Sanity photo (#183) gets its CDN address and
 * size; one from before keeps its stored file address.
 */
export function eventImage(image, { projectId } = {}) {
  if (!image) return null;
  const parsed = parseImageAssetId(image.asset);
  if (parsed) {
    return {
      name: "",
      asset: image.asset,
      url: sanityImageUrl(projectId, image.asset),
      width: parsed.width,
      height: parsed.height,
    };
  }
  const name = text(image.name);
  const url = text(image.url);
  return name || url ? { name, url } : null;
}

/** A gallery photo as kept, or null when it isn't one. */
export function storedGalleryPhoto(photo) {
  const asset = text(photo?.asset);
  const key = text(photo?.key);
  if (!key || !parseImageAssetId(asset)) return null;
  return {
    key,
    asset,
    date: isoDate(photo.date),
    added: text(photo.added),
    source: text(photo.source) || "ops",
  };
}

/** A stored gallery: a list of photos, or null when there is none yet. */
export function storedGallery(list) {
  if (!Array.isArray(list)) return null;
  return list.map(storedGalleryPhoto).filter(Boolean);
}

/** A gallery photo as ops shows it, from the Sanity CDN. */
export function galleryPhoto(photo, options = {}) {
  const { url, width, height } = eventImage({ asset: photo.asset }, options);
  return { ...photo, url, width, height };
}

/** A night as ops works with it. */
export function buildNight(record, options = {}) {
  return {
    id: String(record.id),
    date: record.date,
    slug: record.slug,
    sanityId: record.sanityId,
    clickupTaskId: record.clickupTaskId,
    overrides: { ...record.overrides, image: eventImage(record.overrides?.image, options) },
    isSpecialEdition: false,
    snapshots: record.snapshots || {},
    googleCalendarEventId: record.googleCalendarEventId,
  };
}

/** A series as ops works with it: its nights, and where it stands on the website. */
export function buildEvent(record, nights = [], options = {}) {
  const { mainImage, gallery, ...rest } = record;
  const event = {
    ...rest,
    id: String(record.id),
    slug: record.slug || seriesSlug(record.name),
    driveFolderUrl: driveFolderWebUrl(record.driveFolderId),
    mainImage: eventImage(mainImage, options),
    gallery: Array.isArray(gallery) ? gallery.map((photo) => galleryPhoto(photo, options)) : null,
  };
  const occurrences = dedupeOccurrences(
    nights
      .map((night) => buildNight(night, options))
      .map((occurrence) => ({
        ...occurrence,
        isSpecialEdition: occurrenceIsSpecialEdition(event, occurrence),
      }))
      .filter((date) => date.date),
  );
  return { ...event, dates: occurrences, publish: publishState(event, occurrences) };
}

export function occurrenceRank(row) {
  let score = 0;
  if (row?.snapshots?.preview) score += 2;
  if (row?.snapshots?.production) score += 2;
  if (row?.isSpecialEdition) score += 4;
  if (row?.overrides?.image) score += 2;
  if (row?.sanityId) score += 1;
  if (row?.clickupTaskId) score += 1;
  return score;
}

/** Keep one night per calendar date when storage has duplicate rows. */
export function dedupeOccurrences(occurrences) {
  const byDate = new Map();
  for (const row of occurrences || []) {
    const date = row?.date;
    if (!date) continue;
    const prev = byDate.get(date);
    if (!prev) {
      byDate.set(date, row);
      continue;
    }
    const prevRank = occurrenceRank(prev);
    const nextRank = occurrenceRank(row);
    if (nextRank > prevRank || (nextRank === prevRank && Number(row.id) > Number(prev.id))) {
      byDate.set(date, row);
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function publishState(event, dates, today = todayIso()) {
  const wanted = expandOccurrenceDates(event, { today });
  const materialized = new Set(expandSeriesOccurrenceDates(event));
  const byDate = new Map(dates.map((row) => [row.date, row]));
  // Hash against the date row (overrides), not the bare date string. buildEvent
  // calls this before `dates` are attached to the event object, so a string
  // lookup via occurrenceRow(event, date) would miss night overrides and keep
  // preview forever stale after a successful push.
  const eventWithDates = { ...event, dates };
  const previewCurrent =
    wanted.length > 0 &&
    wanted.every((date) => {
      const row = byDate.get(date);
      return row?.sanityId && row.snapshots?.preview?.hash === occurrenceHash(eventWithDates, row || date);
    }) &&
    // A dropped night already marked removed on the preview counts as done
    // there; it still stands on the live site until Update website (#20).
    !dates.some((row) => row.date >= today && !materialized.has(row.date) && !row.snapshots?.preview?.removed);
  const stillLive = dates.some((row) => row.date >= today && row.snapshots?.preview?.removed);
  const liveCurrent =
    previewCurrent &&
    !stillLive &&
    wanted.every((date) => {
      const row = byDate.get(date);
      return row?.snapshots?.production?.hash === occurrenceHash(eventWithDates, row || date);
    });
  const previewDates = wanted;
  const nextDate = previewDates[0] || dates.find((row) => row.date >= today)?.date || "";
  return {
    preview: previewCurrent ? "current" : dates.some((row) => row.snapshots?.preview) ? "stale" : "unpublished",
    live: liveCurrent ? "current" : dates.some((row) => row.snapshots?.production) ? "stale" : "unpublished",
    nextDate,
    previewDates,
  };
}

function checkedClock(value, label) {
  const raw = text(value);
  const parsed = clockTime(raw);
  if (raw && !parsed) fail(`${label} must use 24-hour HH:mm.`);
  return parsed;
}

export function checkedImageLinks(value) {
  const links = linksFrom(value);
  const invalid = links.find((link) => !/^https?:\/\/\S+$/i.test(link));
  if (invalid) fail(`Image link must start with http:// or https://: ${invalid}`);
  return links;
}

/**
 * A whole series from the editor, checked: the fields the repository saves.
 * `slug` is the series' web address; extraDates and replacesSeries only when given.
 */
export function eventFieldsFromInput(input, { slug } = {}) {
  const name = text(input.name);
  if (!name) fail("Name is required.");
  const startsOn = isoDate(input.startsOn);
  const repeatUnit = text(input.repeatUnit || "none").toLowerCase();
  // A series may have no start date yet: the website shows it with
  // "Check back soon for the next date". A one-off still needs its date.
  if (!startsOn && repeatUnit === "once") fail("Start date is required.");
  if (!REPEAT_UNITS.has(repeatUnit)) fail("Repeat must be none, once, day, week, or month.");
  const repeatEvery = Math.floor(Number(input.repeatEvery) || 1);
  if (repeatEvery < 1 || repeatEvery > 52) fail("Repeat interval must be between 1 and 52.");
  let monthDay = Math.floor(Number(input.monthDay) || 0);
  if (monthDay && (monthDay < 1 || monthDay > 31)) fail("Day of month must be from 1 to 31.");
  const rawEndsOn = text(input.endsOn);
  if (rawEndsOn && !isoDate(rawEndsOn)) fail("End date is not a valid date.");
  const endsOn = rawEndsOn ? isoDate(rawEndsOn) : "";
  const weekdays = normalizeWeekdays(input.weekdays);
  if (repeatUnit === "month" && !monthDay && startsOn) monthDay = Number(startsOn.slice(8, 10)) || 0;
  if (repeatUnit === "week" && !weekdays.length) fail("Choose at least one weekday.");
  if (repeatUnit !== "none" && repeatUnit !== "once" && startsOn && !endsOn) {
    fail("Recurring events need an end date.");
  }
  if (endsOn && startsOn && endsOn < startsOn) fail("End date must be on or after the start date.");
  const fields = {
    name,
    artist: text(input.artist),
    offer: text(input.offer),
    pageUrl: normalizePageUrl(input.pageUrl),
    takingApplications: input.takingApplications === true,
    shortDescription: text(input.shortDescription),
    description: text(input.description),
    operationsNotes: text(input.operationsNotes),
    imageLinks: checkedImageLinks(input.imageLinks),
    heroCrops: parseHeroCrops(input.heroCrops),
    nightSchedule: input.nightSchedule == null ? [] : parseNightSchedule(input.nightSchedule),
    time: text(input.time),
    startTime: checkedClock(input.startTime, "Start time"),
    endTime: checkedClock(input.endTime, "End time"),
    startsOn,
    repeatUnit,
    repeatEvery,
    weekdays,
    monthDay,
    endsOn,
    skippedDates: normalizeSkippedDates(input.skippedDates),
  };
  if (input.extraDates !== undefined) fields.extraDates = normalizeExtraDates(input.extraDates);
  if (input.replacesSeries !== undefined) fields.replacesSeries = text(input.replacesSeries);
  if (slug) fields.slug = slug;
  return fields;
}

/** A night as the repository saves it: overrides tidied, images as kept. */
export function nightForSave(night) {
  const saved = {
    ...(night.id ? { id: String(night.id) } : {}),
    date: night.date,
    slug: night.slug,
    label: night.label,
    sanityId: night.sanityId || "",
    clickupTaskId: night.clickupTaskId || "",
    snapshots: night.snapshots || {},
  };
  if (night.overrides === undefined) return saved;
  const overrides = night.overrides || {};
  saved.overrides = {
    name: text(overrides.name),
    artist: text(overrides.artist),
    offer: text(overrides.offer),
    pageUrl: normalizePageUrl(overrides.pageUrl),
    description: text(overrides.description),
    shortDescription: text(overrides.shortDescription),
    time: text(overrides.time),
    startTime: clockTime(overrides.startTime),
    endTime: clockTime(overrides.endTime),
    nightSchedule: overrides.nightSchedule == null ? null : parseNightSchedule(overrides.nightSchedule),
    operationsNotes: text(overrides.operationsNotes),
    imageLinks: linksFrom(overrides.imageLinks),
    image: storedImage(overrides.image),
    heroCrops: parseHeroCrops(overrides.heroCrops),
  };
  return saved;
}

/**
 * A new web address (/whats-on/<slug>) for a series, checked against the other
 * series. The old one moves to formerSlugs so the website redirects it.
 * Nights keep their own slugs: RSVPs and ticket links are keyed by them.
 * Null when the address does not change.
 */
export function slugChangePlan(current, value, events) {
  const slug = itemSlug(value);
  if (!slug) fail("Use letters or numbers in the web address.");
  if (slug === current.slug) return null;
  if (RESERVED_SLUGS.has(slug)) fail("That web address is used by another page. Pick another.", 409);
  for (const other of events) {
    if (String(other.id) === String(current.id)) continue;
    if ((other.slug || seriesSlug(other.name)) === slug) fail(`${other.name} already uses that web address.`, 409);
    if ((other.formerSlugs || []).includes(slug)) {
      fail(`${other.name} used that web address before, and it still leads there. Pick another.`, 409);
    }
  }
  const formerSlugs = [
    ...new Set([...(current.formerSlugs || []), current.slug].filter((old) => old && old !== slug)),
  ];
  return { slug, previous: current.slug, formerSlugs, events };
}

/**
 * A night no longer in the schedule that is still on the website keeps its
 * row until the website job marks it removed on the preview (publishEventPreview).
 * Deleting it on save would leave it on the website with nothing left to say so.
 */
export function keepsDroppedNight(row, today = todayIso()) {
  return Boolean(row?.sanityId) && row.date >= today;
}

/** Upcoming nights on the website that the schedule no longer has. */
export function droppedNights(event, today = todayIso()) {
  const scheduled = new Set(expandSeriesOccurrenceDates(event));
  return (event?.dates || []).filter((row) => !scheduled.has(row.date) && keepsDroppedNight(row, today));
}

/** The preview is behind ops: nights to write, or dropped nights to mark removed. */
export function previewBehind(event, today = todayIso()) {
  if (droppedNights(event, today).some((row) => !row.snapshots?.preview?.removed)) return true;
  return Boolean(event?.publish?.previewDates?.length) && event.publish.preview !== "current";
}
