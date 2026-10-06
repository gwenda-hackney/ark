/**
 * EventRepository on D1 (#127): the `events` and `event_dates` tables of the
 * ops database (db/ops/migrations/0006_events.sql). The only events code that
 * knows their column names.
 *
 * Values are tidied on the way in the way the Baserow adapter tidies them on
 * the way out, so both hand callers the same records. Several nights change
 * in one batch: one request, and one transaction.
 */
import { batch } from "../../../../../../shared/d1.js";
import { d1Table, exportTables, importTables } from "../../../../../../shared/d1-table.js";
import {
  normalizeExtraDates,
  normalizeSkippedDates,
  normalizeWeekdays,
} from "../../event-recurrence.js";
import { parseNightSchedule } from "../night-schedule.js";
import {
  REPEAT_UNITS,
  clockTime,
  isoDate,
  linksFrom,
  parseHeroCrops,
  slugList,
  storedGallery,
  storedImage,
  text,
} from "../event-model.js";

const events = d1Table({
  table: "events",
  columns: {
    id: "int",
    name: "text",
    artist: "text",
    offer: "text",
    pageUrl: "text",
    shortDescription: "text",
    description: "text",
    operationsNotes: "text",
    imageLinks: "json",
    startsOn: "date",
    time: "text",
    startTime: "text",
    endTime: "text",
    nightSchedule: "json",
    repeatEvery: "int",
    repeatUnit: "text",
    weekdays: "json",
    monthDay: "int",
    endsOn: "date",
    skippedDates: "json",
    extraDates: "json",
    slug: "text",
    formerSlugs: "json",
    deletedAt: "date",
    takingApplications: "bool",
    replacesSeries: "text",
    driveFolderId: "text",
    mainImageAsset: "text",
    heroCrops: "json",
    gallery: "json",
  },
  orderBy: "id",
});

const nights = d1Table({
  table: "event_dates",
  columns: {
    id: "int",
    eventId: "int",
    date: "date",
    slug: "text",
    label: "text",
    sanityId: "text",
    clickupTaskId: "text",
    snapshots: { column: "publish_snapshots", type: "json" },
    googleCalendarEventId: "text",
    overrides: "json",
  },
  orderBy: "id",
});

function notFound(message = "Event not found.") {
  const error = new Error(message);
  error.status = 404;
  return error;
}

const plainObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : null);

/** Each event field as stored: only the fields given, so an update changes only those. */
const EVENT_FIELDS = {
  name: text,
  artist: text,
  offer: text,
  pageUrl: text,
  shortDescription: text,
  description: text,
  operationsNotes: text,
  imageLinks: linksFrom,
  startsOn: isoDate,
  time: text,
  startTime: clockTime,
  endTime: clockTime,
  nightSchedule: parseNightSchedule,
  repeatEvery: (value) => Math.max(1, Math.floor(Number(value) || 1)),
  repeatUnit: (value) => {
    const unit = text(value).toLowerCase();
    return REPEAT_UNITS.has(unit) ? unit : "none";
  },
  weekdays: normalizeWeekdays,
  monthDay: (value) => Math.max(0, Math.floor(Number(value) || 0)),
  endsOn: isoDate,
  skippedDates: normalizeSkippedDates,
  extraDates: normalizeExtraDates,
  slug: text,
  formerSlugs: slugList,
  deletedAt: text,
  takingApplications: (value) => value === true,
  replacesSeries: text,
  driveFolderId: text,
  heroCrops: parseHeroCrops,
  gallery: storedGallery,
};

/** Event fields → table fields. */
function eventToFields(fields) {
  const out = {};
  for (const [key, tidy] of Object.entries(EVENT_FIELDS)) {
    if (key in fields) out[key] = tidy(fields[key]);
  }
  if ("mainImage" in fields) out.mainImageAsset = storedImage(fields.mainImage)?.asset || null;
  return out;
}

/** A whole event as stored, empty where `fields` has nothing. */
function fullEvent(fields) {
  const empty = Object.fromEntries(Object.keys(EVENT_FIELDS).map((key) => [key, undefined]));
  const out = eventToFields({ ...empty, mainImage: null, ...fields });
  if (fields.id != null) out.id = fields.id;
  return out;
}

function eventFromRecord(record) {
  if (!record) return null;
  const { id, mainImageAsset, ...rest } = record;
  return {
    id: String(id),
    ...rest,
    imageLinks: rest.imageLinks || [],
    startsOn: rest.startsOn || "",
    nightSchedule: rest.nightSchedule || [],
    weekdays: rest.weekdays || [],
    endsOn: rest.endsOn || "",
    skippedDates: rest.skippedDates || [],
    extraDates: rest.extraDates || [],
    formerSlugs: rest.formerSlugs || [],
    deletedAt: rest.deletedAt || "",
    mainImage: storedImage({ asset: mainImageAsset }),
    heroCrops: plainObject(rest.heroCrops),
    gallery: rest.gallery || [],
  };
}

/** A night's overrides as stored: every key, empty when not set. */
function tidyOverrides(overrides) {
  const value = overrides || {};
  const schedule = value.nightSchedule == null ? [] : parseNightSchedule(value.nightSchedule);
  return {
    name: text(value.name),
    artist: text(value.artist),
    offer: text(value.offer),
    pageUrl: text(value.pageUrl),
    description: text(value.description),
    shortDescription: text(value.shortDescription),
    time: text(value.time),
    startTime: clockTime(value.startTime),
    endTime: clockTime(value.endTime),
    nightSchedule: schedule.length ? schedule : null,
    operationsNotes: text(value.operationsNotes),
    imageLinks: linksFrom(value.imageLinks),
    image: storedImage(value.image),
    heroCrops: parseHeroCrops(value.heroCrops),
  };
}

/** A night → table fields. Without `overrides`, they aren't written (and so are kept). */
function nightToFields(eventId, night) {
  const out = {
    eventId: eventId === "" || eventId == null ? null : Number(eventId),
    date: isoDate(night.date),
    slug: text(night.slug),
    label: text(night.label),
    sanityId: text(night.sanityId),
    clickupTaskId: text(night.clickupTaskId),
    snapshots: plainObject(night.snapshots) || {},
  };
  if (night.overrides !== undefined) out.overrides = tidyOverrides(night.overrides);
  return out;
}

function nightFromRecord(record) {
  if (!record) return null;
  const { id, eventId: _eventId, ...rest } = record;
  return {
    id: String(id),
    ...rest,
    date: rest.date || "",
    snapshots: plainObject(rest.snapshots) || {},
    overrides: tidyOverrides(rest.overrides),
  };
}

/** @param {any} db  a D1 database: the binding, the REST adapter or the test database */
export function d1EventRepository(db) {
  const getEvent = async (id) => {
    const event = eventFromRecord(await events.get(db, id));
    if (!event) throw notFound();
    return event;
  };

  async function changeGallery(eventId, change) {
    const event = await getEvent(eventId);
    const gallery = storedGallery(change(event.gallery));
    return eventFromRecord(await events.patch(db, eventId, { gallery }));
  }

  /** The statement that saves one night: an update when it has an id, an insert otherwise. */
  const nightStatement = (eventId, night) => {
    const fields = nightToFields(eventId, night);
    if (night.id) return nights.patchStatement(db, night.id, fields);
    return nights.insertStatement(db, { ...fields, overrides: fields.overrides || tidyOverrides(null) });
  };

  return {
    async listEvents() {
      return (await events.list(db)).map(eventFromRecord);
    },

    async listEventsWithNights() {
      const [eventRecords, nightRecords] = await Promise.all([events.list(db), nights.list(db)]);
      const byEvent = new Map();
      for (const record of nightRecords) {
        if (record.eventId == null) continue;
        const key = String(record.eventId);
        if (!byEvent.has(key)) byEvent.set(key, []);
        byEvent.get(key).push(nightFromRecord(record));
      }
      return eventRecords.map((record) => ({
        event: eventFromRecord(record),
        nights: byEvent.get(String(record.id)) || [],
      }));
    },

    get: getEvent,

    async nightsOf(eventId) {
      return (await nights.list(db, { where: "event_id = ?", params: [Number(eventId)] })).map(nightFromRecord);
    },

    async getNight(id) {
      return nightFromRecord(await nights.get(db, id));
    },

    async create(fields) {
      return eventFromRecord(await events.insert(db, fullEvent(fields)));
    },

    async update(id, fields) {
      const { slug, ...rest } = eventToFields(fields);
      const record = await events.patch(db, id, slug ? { ...rest, slug } : rest);
      if (!record) throw notFound();
      return eventFromRecord(record);
    },

    async remove(id) {
      await events.remove(db, id);
    },

    async saveNight(eventId, night) {
      const record = await nightStatement(eventId, night).first();
      if (!record) throw notFound("Night not found.");
      return nightFromRecord(nights.toRecord(record));
    },

    async saveNights(eventId, list) {
      await batch(db, list.map((night) => nightStatement(eventId, night)));
    },

    async removeNight(id) {
      await nights.remove(db, id);
    },

    async saveNightSnapshots(updates) {
      await batch(
        db,
        updates.map((update) =>
          nights.patchStatement(db, update.id, {
            snapshots: plainObject(update.snapshots) || {},
            ...(update.clearCalendar ? { googleCalendarEventId: "" } : {}),
          }),
        ),
      );
    },

    async setNightCalendarLinks(links) {
      await batch(
        db,
        links.map(({ id, value }) => nights.patchStatement(db, id, { googleCalendarEventId: text(value) })),
      );
    },

    async addGalleryPhoto(eventId, photo) {
      return changeGallery(eventId, (gallery) =>
        gallery.some((item) => item.asset === photo.asset) ? gallery : [photo, ...gallery],
      );
    },

    async removeGalleryPhoto(eventId, key) {
      return changeGallery(eventId, (gallery) => gallery.filter((item) => item.key !== key));
    },

    async capabilities() {
      return { formerSlugs: true, shortDescriptionOverride: true, calendarLinks: true };
    },

    /** Every series and night, ids kept; a night carries its eventId ("" for none). */
    async exportAll() {
      const snapshot = await exportTables(db, [events, nights]);
      return {
        events: snapshot.events.map(eventFromRecord),
        nights: snapshot.event_dates.map((record) => ({
          ...nightFromRecord(record),
          eventId: record.eventId == null ? "" : String(record.eventId),
        })),
      };
    },

    /** Replace every series and night with `snapshot`'s, ids kept. */
    async importAll(snapshot) {
      const eventRows = (snapshot.events || []).map((event) => fullEvent({ ...event, id: Number(event.id) }));
      const nightRows = (snapshot.nights || []).map((night) => ({
        ...nightToFields(night.eventId, { ...night, overrides: night.overrides ?? null }),
        id: Number(night.id),
        googleCalendarEventId: text(night.googleCalendarEventId),
      }));
      return importTables(db, [
        [events, eventRows],
        [nights, nightRows],
      ]);
    },
  };
}
