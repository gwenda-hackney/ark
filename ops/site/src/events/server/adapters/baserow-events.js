/**
 * EventRepository on Baserow (#186): the "Events" and "Event dates" tables of
 * the ops database. The only events code that knows their column names, and
 * how ops copes with columns a database doesn't have yet.
 */
import {
  baserowFetch,
  createRow,
  deleteRow,
  getRow,
  linkHasQuery,
  listAllRows,
  resolveOpsTableIds,
  updateRow,
} from "../../../../../../shared/baserow.js";
import { parseImageAssetId } from "../../../../../../shared/sanity-image.js";
import {
  normalizeExtraDates,
  normalizeSkippedDates,
  normalizeWeekdays,
} from "../../event-recurrence.js";
import { calendarLinkValue } from "../../../platform/google-calendar.js";
import { parseNightSchedule, serializeNightSchedule } from "../night-schedule.js";
import {
  REPEAT_UNITS,
  clockTime,
  isoDate,
  linksFrom,
  parseHeroCrops,
  slugList,
  storedGallery,
  text,
} from "../event-model.js";

const PAGE_LINK = "Page link";
const PAGE_LINK_OVERRIDE = "Page link override";
const NIGHT_SCHEDULE = "Night schedule";
/** Night schedules lived in Notes before their own column. */
const NIGHT_SCHEDULE_FALLBACK = "Notes";
const NIGHT_SCHEDULE_OVERRIDE = "Night schedule override";
const SHORT_DESCRIPTION_OVERRIDE = "Short description override";
const FORMER_SLUGS = "Former slugs";
const DELETED_AT = "Deleted at";
const TAKING_APPLICATIONS = "Taking applications";
/** The series' gallery photos as JSON (#183). */
const GALLERY = "Gallery";
const CALENDAR_EVENT = "Google calendar event id";
/** Calendar links lived in Notes before their own column. */
const CALENDAR_FALLBACK = "Notes";
/** Columns added by migrations: a database without them yet saves without them. */
const OPTIONAL_EVENT_COLUMNS = [PAGE_LINK, TAKING_APPLICATIONS, FORMER_SLUGS];

const fieldNamesCache = new Map();

function requireEventsTables(tables) {
  if (!tables.events || !tables.eventDates) {
    const error = new Error(
      'Baserow tables "Events" and "Event dates" were not found. Run npm run setup:baserow-ops.',
    );
    error.status = 503;
    throw error;
  }
  return tables;
}

function notFound(error, message) {
  if (error?.status !== 404) return error;
  const missing = new Error(message);
  missing.status = 404;
  return missing;
}

/** A Sanity image asset id column (#183). */
function imageFromRow(value) {
  const asset = text(value);
  return parseImageAssetId(asset) ? { asset } : null;
}

function cropsJson(value) {
  return value == null || value === "" ? "" : typeof value === "string" ? value : JSON.stringify(value);
}

function parseSnapshots(value) {
  if (!value) return {};
  let parsed = value;
  if (typeof value !== "object") {
    try {
      parsed = JSON.parse(String(value));
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== "object") return {};
  // Rows saved before the preview moved onto drafts call it "staging".
  const { staging, ...rest } = parsed;
  return staging && !rest.preview ? { ...rest, preview: staging } : rest;
}

function galleryFromRow(value) {
  const raw = text(value);
  if (!raw) return [];
  try {
    return storedGallery(JSON.parse(raw));
  } catch {
    return [];
  }
}

function nightScheduleFromRow(row) {
  if (Object.prototype.hasOwnProperty.call(row, NIGHT_SCHEDULE)) {
    const fromField = parseNightSchedule(row[NIGHT_SCHEDULE]);
    if (fromField.length) return fromField;
    // Leftover JSON in Notes from before the dedicated column existed.
  }
  return parseNightSchedule(row[NIGHT_SCHEDULE_FALLBACK]);
}

function nightScheduleOverrideFromRow(row) {
  const raw = row[NIGHT_SCHEDULE_OVERRIDE];
  if (raw == null || String(raw).trim() === "") return null;
  return parseNightSchedule(raw);
}

export function eventFromRow(row) {
  const repeatUnit = text(row["Repeat unit"]).toLowerCase();
  return {
    id: String(row.id),
    name: text(row.Name),
    artist: text(row.Artist),
    offer: text(row.Offer),
    pageUrl: text(row[PAGE_LINK]),
    shortDescription: text(row["Short description"]),
    description: text(row.Description),
    operationsNotes: text(row["Operations notes"]),
    imageLinks: linksFrom(row["Image links"]),
    startsOn: isoDate(row["Starts on"]),
    time: text(row.Time),
    startTime: clockTime(row["Start time"]),
    endTime: clockTime(row["End time"]),
    nightSchedule: nightScheduleFromRow(row),
    repeatEvery: Math.max(1, Math.floor(Number(row["Repeat every"]) || 1)),
    repeatUnit: REPEAT_UNITS.has(repeatUnit) ? repeatUnit : "none",
    weekdays: normalizeWeekdays(row.Weekdays),
    monthDay: Math.max(0, Math.floor(Number(row["Month day"]) || 0)),
    endsOn: isoDate(row["Ends on"]),
    skippedDates: normalizeSkippedDates(row["Skipped dates"]),
    extraDates: normalizeExtraDates(row["Extra dates"]),
    slug: text(row.Slug),
    formerSlugs: slugList(row[FORMER_SLUGS]),
    deletedAt: text(row[DELETED_AT]),
    takingApplications: row[TAKING_APPLICATIONS] === true,
    replacesSeries: text(row["Replaces series"]),
    driveFolderId: text(row["Drive folder id"]),
    mainImage: imageFromRow(row["Hero asset"]),
    heroCrops: parseHeroCrops(row["Hero crops"]),
    gallery: galleryFromRow(row[GALLERY]),
  };
}

export function nightFromRow(row) {
  return {
    id: String(row.id),
    date: isoDate(row.Date),
    slug: text(row.Slug),
    label: text(row.Name),
    sanityId: text(row["Sanity ID"]),
    clickupTaskId: text(row["ClickUp Task ID"]),
    snapshots: parseSnapshots(row["Publish snapshots"]),
    googleCalendarEventId: text(row[CALENDAR_EVENT]) || calendarLinkValue(row[CALENDAR_FALLBACK]),
    overrides: {
      name: text(row["Title override"]),
      artist: text(row["Artist override"]),
      offer: text(row["Offer override"]),
      pageUrl: text(row[PAGE_LINK_OVERRIDE]),
      description: text(row["Description override"]),
      shortDescription: text(row[SHORT_DESCRIPTION_OVERRIDE]),
      time: text(row["Time override"]),
      startTime: clockTime(row["Start time override"]),
      endTime: clockTime(row["End time override"]),
      nightSchedule: nightScheduleOverrideFromRow(row),
      operationsNotes: text(row["Operations notes override"]),
      imageLinks: linksFrom(row["Image links override"]),
      image: imageFromRow(row["Override asset"]),
      heroCrops: parseHeroCrops(row["Override hero crops"]),
    },
  };
}

/** Event fields → Baserow columns, for the columns this database has. */
export function eventToRow(fields, columns) {
  const row = {};
  const put = (key, column, value) => {
    if (key in fields) row[column] = value(fields[key]);
  };
  put("name", "Name", text);
  put("artist", "Artist", text);
  put("offer", "Offer", text);
  put("pageUrl", PAGE_LINK, text);
  put("takingApplications", TAKING_APPLICATIONS, (value) => value === true);
  put("shortDescription", "Short description", text);
  put("description", "Description", text);
  put("operationsNotes", "Operations notes", text);
  put("imageLinks", "Image links", (value) => linksFrom(value).join("\n"));
  put("heroCrops", "Hero crops", cropsJson);
  put("nightSchedule", columns.has(NIGHT_SCHEDULE) ? NIGHT_SCHEDULE : NIGHT_SCHEDULE_FALLBACK, serializeNightSchedule);
  put("time", "Time", text);
  put("startTime", "Start time", text);
  put("endTime", "End time", text);
  put("startsOn", "Starts on", (value) => value || null);
  put("repeatUnit", "Repeat unit", text);
  put("repeatEvery", "Repeat every", Number);
  put("weekdays", "Weekdays", (value) => normalizeWeekdays(value).join(","));
  put("monthDay", "Month day", (value) => value || null);
  put("endsOn", "Ends on", (value) => value || null);
  put("skippedDates", "Skipped dates", (value) => normalizeSkippedDates(value).join("\n"));
  put("extraDates", "Extra dates", (value) => normalizeExtraDates(value).join("\n"));
  put("replacesSeries", "Replaces series", text);
  put("formerSlugs", FORMER_SLUGS, (value) => (value || []).join("\n"));
  put("deletedAt", DELETED_AT, text);
  put("driveFolderId", "Drive folder id", text);
  put("gallery", GALLERY, (value) => JSON.stringify(storedGallery(value)));
  if (fields.slug) row.Slug = fields.slug;
  put("mainImage", "Hero asset", (value) => value?.asset || "");
  for (const column of OPTIONAL_EVENT_COLUMNS) {
    if (column in row && !columns.has(column)) delete row[column];
  }
  return row;
}

/** A night → Baserow columns, for the columns this database has. */
export function nightToRow(eventId, night, columns) {
  const row = {
    Name: night.label,
    Event: [Number(eventId)],
    Date: night.date,
    Slug: night.slug,
    "Sanity ID": night.sanityId || "",
    "ClickUp Task ID": night.clickupTaskId || "",
    "Publish snapshots": JSON.stringify(night.snapshots || {}),
  };
  const overrides = night.overrides;
  if (overrides === undefined) return row;
  Object.assign(row, {
    "Title override": text(overrides?.name),
    "Artist override": text(overrides?.artist),
    "Offer override": text(overrides?.offer),
    "Description override": text(overrides?.description),
    "Time override": text(overrides?.time),
    "Start time override": text(overrides?.startTime),
    "End time override": text(overrides?.endTime),
    "Operations notes override": text(overrides?.operationsNotes),
    "Image links override": linksFrom(overrides?.imageLinks).join("\n"),
    "Override hero crops": cropsJson(overrides?.heroCrops),
    "Override asset": overrides?.image?.asset || "",
  });
  // Added by migrations; ops running before them saves the night without.
  if (columns.has(PAGE_LINK_OVERRIDE)) row[PAGE_LINK_OVERRIDE] = text(overrides?.pageUrl);
  if (columns.has(SHORT_DESCRIPTION_OVERRIDE)) {
    row[SHORT_DESCRIPTION_OVERRIDE] = text(overrides?.shortDescription);
  }
  if (columns.has(NIGHT_SCHEDULE_OVERRIDE)) {
    row[NIGHT_SCHEDULE_OVERRIDE] =
      overrides?.nightSchedule == null ? "" : serializeNightSchedule(overrides.nightSchedule);
  }
  return row;
}

async function columnNames(env, tableId) {
  const key = String(tableId);
  if (!fieldNamesCache.has(key)) {
    const fields = await baserowFetch(env, `/api/database/fields/table/${tableId}/`);
    fieldNamesCache.set(key, new Set((fields || []).map((field) => field.name)));
  }
  return fieldNamesCache.get(key);
}

async function batchUpdate(env, tableId, items) {
  for (let i = 0; i < items.length; i += 200) {
    await baserowFetch(env, `/api/database/rows/table/${tableId}/batch/?user_field_names=true`, {
      method: "PATCH",
      body: JSON.stringify({ items: items.slice(i, i + 200) }),
    });
  }
}

export function baserowEventRepository(env) {
  const tables = async () => requireEventsTables(await resolveOpsTableIds(env));
  const eventColumns = async () => columnNames(env, (await tables()).events);
  const nightColumns = async () => columnNames(env, (await tables()).eventDates);

  /** Read the row just before writing, so photos added meanwhile are kept. */
  async function changeGallery(eventId, change) {
    const { events } = await tables();
    if (!(await eventColumns()).has(GALLERY)) {
      const error = new Error('The events table needs its "Gallery" column: run the migrations.');
      error.status = 503;
      throw error;
    }
    let row;
    try {
      row = await getRow(env, events, eventId);
    } catch (error) {
      throw notFound(error, "Event not found.");
    }
    const gallery = change(galleryFromRow(row[GALLERY]));
    return eventFromRow(await updateRow(env, events, eventId, { [GALLERY]: JSON.stringify(gallery) }));
  }

  return {
    async listEvents() {
      return (await listAllRows(env, (await tables()).events)).map(eventFromRow);
    },

    async listEventsWithNights() {
      const { events, eventDates } = await tables();
      const [rows, dateRows] = await Promise.all([listAllRows(env, events), listAllRows(env, eventDates)]);
      const nightsByEvent = new Map();
      for (const row of dateRows) {
        for (const link of Array.isArray(row.Event) ? row.Event : []) {
          const id = String(link?.id || "");
          if (!id) continue;
          if (!nightsByEvent.has(id)) nightsByEvent.set(id, []);
          nightsByEvent.get(id).push(nightFromRow(row));
        }
      }
      return rows.map((row) => ({ event: eventFromRow(row), nights: nightsByEvent.get(String(row.id)) || [] }));
    },

    async get(id) {
      try {
        return eventFromRow(await getRow(env, (await tables()).events, id));
      } catch (error) {
        throw notFound(error, "Event not found.");
      }
    },

    async nightsOf(eventId) {
      const rows = await listAllRows(env, (await tables()).eventDates, {
        filters: linkHasQuery("Event", eventId),
      });
      return rows.map(nightFromRow);
    },

    async getNight(id) {
      try {
        return nightFromRow(await getRow(env, (await tables()).eventDates, id));
      } catch (error) {
        if (error?.status === 404) return null;
        throw error;
      }
    },

    async create(fields) {
      const row = eventToRow(fields, await eventColumns());
      return eventFromRow(await createRow(env, (await tables()).events, row));
    },

    async update(id, fields) {
      const row = eventToRow(fields, await eventColumns());
      try {
        return eventFromRow(await updateRow(env, (await tables()).events, id, row));
      } catch (error) {
        throw notFound(error, "Event not found.");
      }
    },

    async remove(id) {
      await deleteRow(env, (await tables()).events, id);
    },

    async saveNight(eventId, night) {
      const { eventDates } = await tables();
      const row = nightToRow(eventId, night, await nightColumns());
      const saved = night.id
        ? await updateRow(env, eventDates, night.id, row)
        : await createRow(env, eventDates, row);
      return nightFromRow(saved);
    },

    /** Existing nights in batches (Baserow allows 200 a call), new ones one by one. */
    async saveNights(eventId, nights) {
      const { eventDates } = await tables();
      const columns = await nightColumns();
      const existing = [];
      for (const night of nights) {
        const row = nightToRow(eventId, night, columns);
        if (night.id) existing.push({ id: Number(night.id), ...row });
        else await createRow(env, eventDates, row);
      }
      await batchUpdate(env, eventDates, existing);
    },

    async removeNight(id) {
      try {
        await deleteRow(env, (await tables()).eventDates, id);
      } catch (error) {
        if (error?.status !== 404) throw error;
      }
    },

    async saveNightSnapshots(updates) {
      await batchUpdate(
        env,
        (await tables()).eventDates,
        updates.map((night) => ({
          id: Number(night.id),
          "Publish snapshots": JSON.stringify(night.snapshots || {}),
          ...(night.clearCalendar ? { [CALENDAR_EVENT]: "" } : {}),
        })),
      );
    },

    async setNightCalendarLinks(links) {
      const columns = await nightColumns();
      const column = columns.has(CALENDAR_EVENT) ? CALENDAR_EVENT : columns.has(CALENDAR_FALLBACK) ? CALENDAR_FALLBACK : "";
      if (!column) return;
      await batchUpdate(
        env,
        (await tables()).eventDates,
        links.map(({ id, value }) => ({
          id: Number(id),
          [column]: value,
          // A link in its own column clears the old copy kept in Notes, if there is one.
          ...(column === CALENDAR_EVENT && columns.has(CALENDAR_FALLBACK) ? { [CALENDAR_FALLBACK]: "" } : {}),
        })),
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
      const [events, nights] = await Promise.all([eventColumns(), nightColumns()]);
      return {
        formerSlugs: events.has(FORMER_SLUGS),
        shortDescriptionOverride: nights.has(SHORT_DESCRIPTION_OVERRIDE),
        calendarLinks: nights.has(CALENDAR_EVENT) || nights.has(CALENDAR_FALLBACK),
      };
    },

    /** Every series and night, ids kept; a night carries its eventId ("" for none). A source only. */
    async exportAll() {
      const { events, eventDates } = await tables();
      const [rows, dateRows] = await Promise.all([listAllRows(env, events), listAllRows(env, eventDates)]);
      const byId = (a, b) => Number(a.id) - Number(b.id);
      return {
        events: rows.map(eventFromRow).sort(byId),
        nights: dateRows
          .map((row) => {
            const link = Array.isArray(row.Event) ? row.Event[0] : null;
            return { ...nightFromRow(row), eventId: link?.id ? String(link.id) : "" };
          })
          .sort(byId),
      };
    },
  };
}
