/**
 * Ops events. One row is the series. Event dates are the nights publish writes.
 */
import { itemSlug, namesClash } from "./item-key.js";
import {
  baserowApiBase,
  baserowFetch,
  createRow,
  deleteRow,
  getRow,
  linkHasQuery,
  listAllRows,
  resolveOpsTableIds,
  updateRow,
  uploadUserFile,
} from "./baserow.js";
import {
  dayBeforeIso,
  expandOccurrenceDates,
  expandSeriesOccurrenceDates,
  normalizeExtraDates,
  normalizeSkippedDates,
  normalizeWeekdays,
  parseIsoDate,
  planOccurrenceMove,
  todayIso,
} from "./event-recurrence.js";
import {
  occurrenceHash,
  occurrenceIsSpecialEdition,
  occurrenceSlug,
  resolveOccurrenceContent,
  seriesSlug,
  titleOverrideEchoesSeries,
  titleOverrideForSave,
} from "./event-content.js";
import {
  forgetCalendarOccurrences,
  noteCalendarWarning,
} from "./event-calendar-sync.js";
import { calendarLinkValue } from "./google-calendar.js";
import {
  GALLERY_FOLDER_NAME,
  createEventDriveFolder,
  driveFolderWebUrl,
  ensureNamedChildFolder,
  isOccurrenceHeroDriveName,
  isSeriesHeroDriveName,
  listDriveChildren,
  occurrenceHeroDriveName,
  renameDriveFile,
  seriesHeroDriveName,
  trashDriveFile,
  untrashDriveFile,
  uploadDriveFile,
} from "./google-drive.js";
import {
  parseNightSchedule,
  serializeNightSchedule,
} from "./night-schedule.js";

const REPEAT_UNITS = new Set(["none", "once", "day", "week", "month"]);

function parseHeroCropsJson(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function text(value) {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  if (typeof value === "object" && value.value != null)
    return String(value.value).trim();
  return String(value).trim();
}

function isoDate(value) {
  const raw = text(value).slice(0, 10);
  return parseIsoDate(raw) ? raw : "";
}

/** Empty is allowed. Anything else must be an http(s) URL. */
export function normalizePageUrl(value) {
  const raw = text(value);
  if (!raw) return "";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    parsed = null;
  }
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
    const error = new Error("Page link must start with http:// or https://.");
    error.status = 400;
    throw error;
  }
  return parsed.toString();
}

function assignPageLink(fields, value) {
  if (!eventsFieldNamesCache?.has(PAGE_LINK_FIELD)) return;
  fields[PAGE_LINK_FIELD] = normalizePageUrl(value);
}

function clockTime(value) {
  const raw = text(value);
  if (!raw) return "";
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function filesFrom(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => ({
      name: text(entry?.name || entry?.visible_name),
      url: text(entry?.url),
    }))
    .filter((entry) => entry.url || entry.name);
}

function linksFrom(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
  return raw.map((entry) => text(entry)).filter(Boolean);
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

/** Prefer dedicated column; fall back to unused Notes until schema sync. */
const PAGE_LINK_FIELD = "Page link";
const NIGHT_SCHEDULE_FIELD = "Night schedule";
const NIGHT_SCHEDULE_FALLBACK = "Notes";
const NIGHT_SCHEDULE_OVERRIDE_FIELD = "Night schedule override";
const SHORT_DESCRIPTION_OVERRIDE_FIELD = "Short description override";
let eventsFieldNamesCache = null;
let eventDatesFieldNamesCache = null;

async function tableFieldNames(env, tableId) {
  const fields = await baserowFetch(
    env,
    `/api/database/fields/table/${tableId}/`,
  );
  return new Set((fields || []).map((field) => field.name));
}

async function nightScheduleFieldName(env) {
  if (!eventsFieldNamesCache) {
    const tables = requireEventsTables(await resolveOpsTableIds(env));
    eventsFieldNamesCache = await tableFieldNames(env, tables.events);
  }
  return eventsFieldNamesCache.has(NIGHT_SCHEDULE_FIELD)
    ? NIGHT_SCHEDULE_FIELD
    : NIGHT_SCHEDULE_FALLBACK;
}

export async function hasShortDescriptionOverrideColumn(env) {
  const names = await eventDateFieldNames(env);
  return names.has(SHORT_DESCRIPTION_OVERRIDE_FIELD);
}

async function eventDateFieldNames(env) {
  if (!eventDatesFieldNamesCache) {
    const tables = requireEventsTables(await resolveOpsTableIds(env));
    eventDatesFieldNamesCache = await tableFieldNames(env, tables.eventDates);
  }
  return eventDatesFieldNamesCache;
}

async function nightScheduleOverrideFieldName(env) {
  const names = await eventDateFieldNames(env);
  return names.has(NIGHT_SCHEDULE_OVERRIDE_FIELD)
    ? NIGHT_SCHEDULE_OVERRIDE_FIELD
    : null;
}

function readNightScheduleFromRow(row) {
  if (Object.prototype.hasOwnProperty.call(row, NIGHT_SCHEDULE_FIELD)) {
    const fromField = parseNightSchedule(row[NIGHT_SCHEDULE_FIELD]);
    if (fromField.length) return fromField;
    // Leftover JSON in Notes from before the dedicated column existed.
    return parseNightSchedule(row[NIGHT_SCHEDULE_FALLBACK]);
  }
  return parseNightSchedule(row[NIGHT_SCHEDULE_FALLBACK]);
}

function readNightScheduleOverrideFromRow(row) {
  if (Object.prototype.hasOwnProperty.call(row, NIGHT_SCHEDULE_OVERRIDE_FIELD)) {
    const raw = row[NIGHT_SCHEDULE_OVERRIDE_FIELD];
    if (raw == null || String(raw).trim() === "") return null;
    return parseNightSchedule(raw);
  }
  return null;
}

export function mapEventDate(row) {
  const overrides = {
    name: text(row["Title override"]),
    artist: text(row["Artist override"]),
    offer: text(row["Offer override"]),
    description: text(row["Description override"]),
    shortDescription: text(row[SHORT_DESCRIPTION_OVERRIDE_FIELD]),
    time: text(row["Time override"]),
    startTime: clockTime(row["Start time override"]),
    endTime: clockTime(row["End time override"]),
    nightSchedule: readNightScheduleOverrideFromRow(row),
    operationsNotes: text(row["Operations notes override"]),
    imageLinks: linksFrom(row["Image links override"]),
    image: filesFrom(row["Override image"])[0] || null,
    heroCrops: parseHeroCropsJson(row["Override hero crops"]),
  };
  return {
    id: String(row.id),
    date: isoDate(row.Date),
    slug: text(row.Slug),
    sanityId: text(row["Sanity ID"]),
    clickupTaskId: text(row["ClickUp Task ID"]),
    overrides,
    isSpecialEdition: false,
    snapshots: parseSnapshots(row["Publish snapshots"]),
    googleCalendarEventId:
      text(row["Google calendar event id"]) || calendarLinkValue(row.Notes),
  };
}

export function mapEvent(row, dates = []) {
  const name = text(row.Name);
  const event = {
    id: String(row.id),
    name,
    artist: text(row.Artist),
    offer: text(row.Offer),
    pageUrl: text(row["Page link"]),
    shortDescription: text(row["Short description"]),
    description: text(row.Description),
    operationsNotes: text(row["Operations notes"]),
    imageLinks: linksFrom(row["Image links"]),
    startsOn: isoDate(row["Starts on"]),
    time: text(row.Time),
    startTime: clockTime(row["Start time"]),
    endTime: clockTime(row["End time"]),
    nightSchedule: readNightScheduleFromRow(row),
    repeatEvery: Math.max(1, Math.floor(Number(row["Repeat every"]) || 1)),
    repeatUnit: REPEAT_UNITS.has(text(row["Repeat unit"]).toLowerCase())
      ? text(row["Repeat unit"]).toLowerCase()
      : "none",
    weekdays: normalizeWeekdays(row.Weekdays),
    monthDay: Math.max(0, Math.floor(Number(row["Month day"]) || 0)),
    endsOn: isoDate(row["Ends on"]),
    skippedDates: normalizeSkippedDates(row["Skipped dates"]),
    extraDates: normalizeExtraDates(row["Extra dates"]),
    slug: text(row.Slug) || seriesSlug(name),
    replacesSeries: text(row["Replaces series"]),
    driveFolderId: text(row["Drive folder id"]),
    driveFolderUrl: driveFolderWebUrl(text(row["Drive folder id"])),
    mainImage: filesFrom(row["Main image"])[0] || null,
    heroCrops: parseHeroCropsJson(row["Hero crops"]),
    images: filesFrom(row.Images),
  };
  const occurrences = dedupeOccurrences(
    dates
      .map(mapEventDate)
      .map((occurrence) => ({
        ...occurrence,
        isSpecialEdition: occurrenceIsSpecialEdition(event, occurrence),
      }))
      .filter((date) => date.date),
  );
  return {
    ...event,
    dates: occurrences,
    publish: publishState(event, occurrences),
  };
}

function occurrenceRank(row) {
  let score = 0;
  if (row?.snapshots?.preview) score += 2;
  if (row?.snapshots?.production) score += 2;
  if (row?.isSpecialEdition) score += 4;
  if (row?.overrides?.image) score += 2;
  if (row?.sanityId) score += 1;
  if (row?.clickupTaskId) score += 1;
  return score;
}

/** Keep one row per calendar night when Baserow has duplicate date rows. */
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
    if (
      nextRank > prevRank ||
      (nextRank === prevRank && Number(row.id) > Number(prev.id))
    ) {
      byDate.set(date, row);
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function publishState(event, dates, today = todayIso()) {
  const wanted = expandOccurrenceDates(event, { today });
  const materialized = new Set(expandSeriesOccurrenceDates(event));
  const byDate = new Map(dates.map((row) => [row.date, row]));
  // Hash against the date row (overrides), not the bare date string. mapEvent
  // calls this before `dates` are attached to the event object, so a string
  // lookup via occurrenceRow(event, date) would miss night overrides and keep
  // preview forever stale after a successful push.
  const eventWithDates = { ...event, dates };
  const previewCurrent =
    wanted.length > 0 &&
    wanted.every((date) => {
      const row = byDate.get(date);
      return (
        row?.sanityId &&
        row.snapshots?.preview?.hash ===
          occurrenceHash(eventWithDates, row || date)
      );
    }) &&
    !dates.some((row) => row.date >= today && !materialized.has(row.date));
  const liveCurrent =
    previewCurrent &&
    wanted.every((date) => {
      const row = byDate.get(date);
      return (
        row?.snapshots?.production?.hash ===
        occurrenceHash(eventWithDates, row || date)
      );
    });
  const previewDates = wanted;
  const nextDate =
    previewDates[0] || dates.find((row) => row.date >= today)?.date || "";
  return {
    preview: previewCurrent
      ? "current"
      : dates.some((row) => row.snapshots?.preview)
        ? "stale"
        : "unpublished",
    live: liveCurrent
      ? "current"
      : dates.some((row) => row.snapshots?.production)
        ? "stale"
        : "unpublished",
    nextDate,
    previewDates,
  };
}

function fieldsFromInput(
  input,
  { partial = false, slug, nightScheduleField = NIGHT_SCHEDULE_FIELD } = {},
) {
  const fields = {};
  const set = (key, present, value) => {
    if (!partial || present) fields[key] = value;
  };
  if (!partial || input.name !== undefined) {
    const name = text(input.name);
    if (!name) {
      const error = new Error("Name is required.");
      error.status = 400;
      throw error;
    }
    fields.Name = name;
  }
  set("Artist", input.artist !== undefined, text(input.artist));
  set("Offer", input.offer !== undefined, text(input.offer));
  set(
    "Short description",
    input.shortDescription !== undefined,
    text(input.shortDescription),
  );
  set("Description", input.description !== undefined, text(input.description));
  set(
    "Operations notes",
    input.operationsNotes !== undefined,
    text(input.operationsNotes),
  );
  if (!partial || input.imageLinks !== undefined) {
    const links = linksFrom(input.imageLinks);
    const invalid = links.find((link) => !/^https?:\/\/\S+$/i.test(link));
    if (invalid) {
      const error = new Error(
        `Image link must start with http:// or https://: ${invalid}`,
      );
      error.status = 400;
      throw error;
    }
    fields["Image links"] = links.join("\n");
  }
  if (input.heroCrops !== undefined) {
    fields["Hero crops"] =
      input.heroCrops == null || input.heroCrops === ""
        ? ""
        : typeof input.heroCrops === "string"
          ? input.heroCrops
          : JSON.stringify(input.heroCrops);
  } else if (!partial) {
    fields["Hero crops"] = "";
  }
  if (input.nightSchedule !== undefined) {
    fields[nightScheduleField] = serializeNightSchedule(input.nightSchedule);
  } else if (!partial) {
    fields[nightScheduleField] = "";
  }
  set("Time", input.time !== undefined, text(input.time));
  if (!partial || input.startTime !== undefined) {
    const value = text(input.startTime);
    const parsed = clockTime(value);
    if (value && !parsed) {
      const error = new Error("Start time must use 24-hour HH:mm.");
      error.status = 400;
      throw error;
    }
    fields["Start time"] = parsed;
  }
  if (!partial || input.endTime !== undefined) {
    const value = text(input.endTime);
    const parsed = clockTime(value);
    if (value && !parsed) {
      const error = new Error("End time must use 24-hour HH:mm.");
      error.status = 400;
      throw error;
    }
    fields["End time"] = parsed;
  }
  if (!partial || input.startsOn !== undefined) {
    const startsOn = isoDate(input.startsOn);
    const unit = text(input.repeatUnit || "none").toLowerCase();
    // Scheduled series (does not repeat) may have no nights yet. Recurring
    // series still need a start date for the rule.
    if (!startsOn && unit !== "none") {
      const error = new Error("Start date is required.");
      error.status = 400;
      throw error;
    }
    fields["Starts on"] = startsOn || null;
  }
  if (!partial || input.repeatUnit !== undefined) {
    const unit = text(input.repeatUnit || "none").toLowerCase();
    if (!REPEAT_UNITS.has(unit)) {
      const error = new Error("Repeat must be none, once, day, week, or month.");
      error.status = 400;
      throw error;
    }
    fields["Repeat unit"] = unit;
  }
  if (!partial || input.repeatEvery !== undefined) {
    const every = Math.floor(Number(input.repeatEvery) || 1);
    if (every < 1 || every > 52) {
      const error = new Error("Repeat interval must be between 1 and 52.");
      error.status = 400;
      throw error;
    }
    fields["Repeat every"] = every;
  }
  if (!partial || input.weekdays !== undefined) {
    fields.Weekdays = normalizeWeekdays(input.weekdays).join(",");
  }
  if (!partial || input.monthDay !== undefined) {
    const day = Math.floor(Number(input.monthDay) || 0);
    if (day && (day < 1 || day > 31)) {
      const error = new Error("Day of month must be from 1 to 31.");
      error.status = 400;
      throw error;
    }
    fields["Month day"] = day || null;
  }
  if (!partial || input.endsOn !== undefined) {
    const endsOn = text(input.endsOn);
    if (endsOn && !isoDate(endsOn)) {
      const error = new Error("End date is not a valid date.");
      error.status = 400;
      throw error;
    }
    fields["Ends on"] = endsOn ? isoDate(endsOn) : null;
  }
  if (!partial || input.skippedDates !== undefined) {
    fields["Skipped dates"] = normalizeSkippedDates(input.skippedDates).join(
      "\n",
    );
  }
  // Only write when present so older Baserow tables without the column still save.
  if (input.extraDates !== undefined) {
    fields["Extra dates"] = normalizeExtraDates(input.extraDates).join("\n");
  }
  if (input.replacesSeries !== undefined) {
    fields["Replaces series"] = text(input.replacesSeries);
  }
  if (slug) fields.Slug = slug;
  const unit = fields["Repeat unit"];
  const weekdays = fields.Weekdays;
  if (
    fields["Repeat unit"] === "month" &&
    !fields["Month day"] &&
    fields["Starts on"]
  ) {
    fields["Month day"] =
      Number(String(fields["Starts on"]).slice(8, 10)) || null;
  }
  if (unit === "week" && !weekdays) {
    const error = new Error("Choose at least one weekday.");
    error.status = 400;
    throw error;
  }
  if (unit && unit !== "none" && unit !== "once" && !fields["Ends on"]) {
    const error = new Error("Recurring events need an end date.");
    error.status = 400;
    throw error;
  }
  if (
    fields["Ends on"] &&
    fields["Starts on"] &&
    fields["Ends on"] < fields["Starts on"]
  ) {
    const error = new Error("End date must be on or after the start date.");
    error.status = 400;
    throw error;
  }
  return fields;
}

async function loadDates(env, tables, eventId) {
  const rows = await listAllRows(env, tables.eventDates, {
    filters: linkHasQuery("Event", eventId),
  });
  return rows;
}

async function assertUniqueName(env, tables, name, exceptId = "") {
  const rows = await listAllRows(env, tables.events);
  const clash = rows.find(
    (row) => String(row.id) !== String(exceptId) && namesClash(row.Name, name),
  );
  if (clash) {
    const error = new Error("An event with that name already exists.");
    error.status = 409;
    throw error;
  }
  const slug = itemSlug(name);
  if (!slug) {
    const error = new Error(
      "Use letters or numbers in the name so it can be a link.",
    );
    error.status = 400;
    throw error;
  }
  return slug;
}

export async function listEvents(env) {
  const tables = requireEventsTables(await resolveOpsTableIds(env));
  const [rows, dateRows] = await Promise.all([
    listAllRows(env, tables.events),
    listAllRows(env, tables.eventDates),
  ]);
  const datesByEvent = new Map();
  for (const row of dateRows) {
    const links = Array.isArray(row.Event) ? row.Event : [];
    for (const link of links) {
      const id = String(link?.id || "");
      if (!id) continue;
      if (!datesByEvent.has(id)) datesByEvent.set(id, []);
      datesByEvent.get(id).push(row);
    }
  }
  return rows
    .filter((row) => text(row.Name))
    .map((row) => mapEvent(row, datesByEvent.get(String(row.id)) || []))
    .sort(
      (a, b) =>
        (a.publish.nextDate || "9999").localeCompare(
          b.publish.nextDate || "9999",
        ) || a.name.localeCompare(b.name),
    );
}

async function readEventRow(env, tables, id) {
  try {
    return await getRow(env, tables.events, id);
  } catch (error) {
    if (error?.status === 404) {
      const missing = new Error("Event not found.");
      missing.status = 404;
      throw missing;
    }
    throw error;
  }
}

export async function getEvent(env, id) {
  const tables = requireEventsTables(await resolveOpsTableIds(env));
  const row = await readEventRow(env, tables, id);
  const dates = await loadDates(env, tables, id);
  return mapEvent(row, dates);
}

async function takenDriveFolderIds(env, tables, exceptId = "") {
  const rows = await listAllRows(env, tables.events);
  const ids = [];
  for (const row of rows) {
    if (String(row.id) === String(exceptId)) continue;
    const folderId = text(row["Drive folder id"]);
    if (folderId) ids.push(folderId);
  }
  return ids;
}

/** Ensure the event has a Drive folder; create one if missing. */
export async function ensureEventDriveFolder(env, id) {
  const event = await getEvent(env, id);
  if (event.driveFolderId) return event;
  const tables = requireEventsTables(await resolveOpsTableIds(env));
  const folder = await createEventDriveFolder(env, event.name || "Event", {
    takenFolderIds: await takenDriveFolderIds(env, tables, id),
  });
  await updateRow(env, tables.events, id, {
    "Drive folder id": folder.id,
  });
  return getEvent(env, id);
}

/** Gallery folder under the series. The hero copy sits in the series folder. */
export async function ensureEventGalleryFolder(env, id) {
  const event = await ensureEventDriveFolder(env, id);
  const gallery = await ensureNamedChildFolder(
    env,
    event.driveFolderId,
    GALLERY_FOLDER_NAME,
  );
  return { event, gallery };
}

export async function createEvent(env, input) {
  const tables = requireEventsTables(await resolveOpsTableIds(env));
  const name = text(input?.name);
  const slug = await assertUniqueName(env, tables, name);
  const driveFolder = await createEventDriveFolder(env, name, {
    takenFolderIds: await takenDriveFolderIds(env, tables),
  });
  const nightScheduleField = await nightScheduleFieldName(env);
  const fields = fieldsFromInput(input || {}, { slug, nightScheduleField });
  assignPageLink(fields, input?.pageUrl);
  fields["Drive folder id"] = driveFolder.id;
  let row;
  try {
    row = await createRow(env, tables.events, fields);
  } catch (error) {
    if (!driveFolder.reused && driveFolder.id) {
      try {
        await trashDriveFile(env, driveFolder.id);
      } catch {
        /* keep the Baserow error */
      }
    }
    throw error;
  }
  return syncEventOccurrences(env, mapEvent(row, []));
}

export async function updateEvent(env, id, input) {
  const tables = requireEventsTables(await resolveOpsTableIds(env));
  const current = await getEvent(env, id);
  const previousName = text(current.name);
  const merged = {
    name: input?.name !== undefined ? input.name : current.name,
    artist: input?.artist !== undefined ? input.artist : current.artist,
    offer: input?.offer !== undefined ? input.offer : current.offer,
    pageUrl: input?.pageUrl !== undefined ? input.pageUrl : current.pageUrl,
    shortDescription:
      input?.shortDescription !== undefined
        ? input.shortDescription
        : current.shortDescription,
    description:
      input?.description !== undefined
        ? input.description
        : current.description,
    operationsNotes:
      input?.operationsNotes !== undefined
        ? input.operationsNotes
        : current.operationsNotes,
    imageLinks:
      input?.imageLinks !== undefined ? input.imageLinks : current.imageLinks,
    heroCrops:
      input?.heroCrops !== undefined ? input.heroCrops : current.heroCrops,
    nightSchedule:
      input?.nightSchedule !== undefined
        ? input.nightSchedule
        : current.nightSchedule,
    startsOn: input?.startsOn !== undefined ? input.startsOn : current.startsOn,
    time: input?.time !== undefined ? input.time : current.time,
    startTime:
      input?.startTime !== undefined ? input.startTime : current.startTime,
    endTime: input?.endTime !== undefined ? input.endTime : current.endTime,
    repeatEvery:
      input?.repeatEvery !== undefined
        ? input.repeatEvery
        : current.repeatEvery,
    repeatUnit:
      input?.repeatUnit !== undefined ? input.repeatUnit : current.repeatUnit,
    weekdays: input?.weekdays !== undefined ? input.weekdays : current.weekdays,
    monthDay: input?.monthDay !== undefined ? input.monthDay : current.monthDay,
    endsOn: input?.endsOn !== undefined ? input.endsOn : current.endsOn,
    skippedDates:
      input?.skippedDates !== undefined
        ? input.skippedDates
        : current.skippedDates,
  };
  if (input?.extraDates !== undefined) {
    merged.extraDates = input.extraDates;
  }
  if (input?.replacesSeries !== undefined) {
    merged.replacesSeries = input.replacesSeries;
  }
  if (input?.name !== undefined)
    await assertUniqueName(env, tables, text(merged.name), id);
  const nightScheduleField = await nightScheduleFieldName(env);
  const fields = fieldsFromInput(merged, {
    slug: current.slug || seriesSlug(merged.name),
    nightScheduleField,
  });
  assignPageLink(fields, merged.pageUrl);
  const nextName = text(merged.name);
  const nameChanged =
    input?.name !== undefined &&
    previousName &&
    nextName &&
    previousName.toLowerCase() !== nextName.toLowerCase();
  if (nameChanged && current.driveFolderId) {
    await renameDriveFile(env, current.driveFolderId, nextName);
  }
  let row;
  try {
    row = await updateRow(env, tables.events, id, fields);
  } catch (error) {
    if (nameChanged && current.driveFolderId) {
      try {
        await renameDriveFile(env, current.driveFolderId, previousName);
      } catch {
        /* keep the Baserow error */
      }
    }
    throw error;
  }
  const dates = await loadDates(env, tables, id);
  let event = mapEvent(row, dates);
  if (nameChanged) {
    event = await clearSeriesTitleEchoes(env, event, previousName);
  }
  return syncEventOccurrences(env, event);
}

/** Drop night title overrides that only repeated the old series name. */
async function clearSeriesTitleEchoes(env, event, previousName) {
  let changed = false;
  for (const row of event.dates || []) {
    const overrideName = text(row.overrides?.name);
    if (!titleOverrideEchoesSeries(previousName, overrideName)) continue;
    await saveOccurrence(env, event.id, {
      ...row,
      label: `${event.name} · ${row.date}`,
      overrides: {
        ...row.overrides,
        name: "",
      },
    });
    changed = true;
  }
  return changed ? getEvent(env, event.id) : event;
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
  return (event?.dates || []).filter(
    (row) => !scheduled.has(row.date) && keepsDroppedNight(row, today),
  );
}

/** The preview is behind ops: nights to write, or dropped nights to mark removed. */
export function previewBehind(event, today = todayIso()) {
  if (droppedNights(event, today).length) return true;
  return Boolean(event?.publish?.previewDates?.length) && event.publish.preview !== "current";
}

export async function syncEventOccurrences(env, event) {
  const tables = requireEventsTables(await resolveOpsTableIds(env));
  const wanted = new Set(expandSeriesOccurrenceDates(event));
  const byDate = new Map();
  const extras = [];
  for (const row of event.dates || []) {
    const prev = byDate.get(row.date);
    if (!prev) {
      byDate.set(row.date, row);
      continue;
    }
    const keep =
      occurrenceRank(row) > occurrenceRank(prev) ||
      (occurrenceRank(row) === occurrenceRank(prev) &&
        Number(row.id) > Number(prev.id))
        ? row
        : prev;
    const drop = keep === row ? prev : row;
    byDate.set(row.date, keep);
    extras.push(drop);
  }
  for (const row of extras) {
    if (row?.id) await removeOccurrence(env, row.id);
  }
  const today = todayIso();
  for (const [date, row] of byDate) {
    if (wanted.has(date)) continue;
    if (keepsDroppedNight(row, today)) continue;
    if (row?.id) await removeOccurrence(env, row.id);
    byDate.delete(date);
  }
  for (const date of wanted) {
    if (byDate.has(date)) continue;
    await saveOccurrence(env, event.id, {
      date,
      slug: occurrenceSlug(event.slug, date),
      label: `${event.name} · ${date}`,
      overrides: {
        name: "",
        artist: "",
        offer: "",
        description: "",
        time: "",
        startTime: "",
        endTime: "",
        operationsNotes: "",
        imageLinks: [],
        image: null,
      },
    });
  }
  return getEvent(env, event.id);
}

export async function deleteEvent(env, id) {
  const tables = requireEventsTables(await resolveOpsTableIds(env));
  const event = await getEvent(env, id);
  const dates = event.dates || [];
  const folderId = event.driveFolderId;
  if (folderId) await trashDriveFile(env, folderId);
  try {
    for (const row of dates) {
      if (row?.id) await removeOccurrence(env, row.id);
    }
    await deleteRow(env, tables.events, id);
  } catch (error) {
    if (folderId) {
      try {
        await untrashDriveFile(env, folderId);
      } catch {
        /* keep the Baserow error */
      }
    }
    throw error;
  }
  return { id: String(id), dates: dates.map(mapEventDate) };
}

/**
 * Targets for a scoped occurrence delete. Same scopes as occurrence edit:
 * this, following, all (all upcoming from today).
 */
export function occurrenceDeleteTargets(event, date, scope = "this") {
  const normalized = isoDate(date);
  if (!normalized) {
    const error = new Error("Date is not valid.");
    error.status = 400;
    throw error;
  }
  const resolved = ["this", "following", "all"].includes(scope)
    ? scope
    : "this";
  const today = todayIso();
  if (
    String(event?.repeatUnit || "none").toLowerCase() === "none" ||
    resolved === "all"
  ) {
    if (
      resolved === "all" &&
      String(event?.repeatUnit || "none").toLowerCase() !== "none"
    ) {
      return {
        scope: "all",
        mode: "end",
        date: normalized,
        endsOn: dayBeforeIso(today),
        targets: (event.dates || []).filter((row) => row.date >= today),
      };
    }
    const dates = event.dates || [];
    // Scheduled multi-night series: remove only the targeted nights.
    if (
      String(event?.repeatUnit || "none").toLowerCase() === "none" &&
      resolved === "this" &&
      dates.length > 1
    ) {
      const row = dates.find((item) => item.date === normalized);
      return {
        scope: "this",
        mode: "detach",
        date: normalized,
        endsOn: "",
        targets: row ? [row] : [],
      };
    }
    if (
      String(event?.repeatUnit || "none").toLowerCase() === "none" &&
      resolved === "following" &&
      dates.some((row) => row.date > normalized)
    ) {
      const targets = dates.filter((row) => row.date >= normalized);
      if (targets.length < dates.length) {
        return {
          scope: "following",
          mode: "detach",
          date: normalized,
          endsOn: "",
          targets,
        };
      }
    }
    return {
      scope: resolved === "all" ? "all" : "this",
      mode: "series",
      date: normalized,
      endsOn: "",
      targets: dates,
    };
  }
  if (resolved === "following") {
    return {
      scope: "following",
      mode: "end",
      date: normalized,
      endsOn: dayBeforeIso(normalized),
      targets: (event.dates || []).filter((row) => row.date >= normalized),
    };
  }
  const row = (event.dates || []).find((item) => item.date === normalized);
  return {
    scope: "this",
    mode: "skip",
    date: normalized,
    endsOn: "",
    targets: row ? [row] : [],
  };
}

export async function deleteOccurrences(env, eventId, date, scope = "this") {
  const event = await getEvent(env, eventId);
  const plan = occurrenceDeleteTargets(event, date, scope);

  if (plan.mode === "series") {
    await deleteEvent(env, eventId);
    return {
      deleted: true,
      event: null,
      scope: plan.scope,
      removed: plan.targets.length,
      targets: plan.targets,
    };
  }

  if (plan.mode === "detach") {
    let series = event;
    for (const row of plan.targets) {
      series = (await detachOccurrenceFromSeries(env, series, row)) || null;
      if (!series) {
        return {
          deleted: true,
          event: null,
          scope: plan.scope,
          removed: plan.targets.length,
          targets: plan.targets,
        };
      }
    }
    return {
      deleted: false,
      event: series,
      scope: plan.scope,
      removed: plan.targets.length,
      targets: plan.targets,
    };
  }

  if (plan.mode === "end") {
    const endsOn = plan.endsOn;
    if (!endsOn || (event.startsOn && endsOn < event.startsOn)) {
      await deleteEvent(env, eventId);
      return {
        deleted: true,
        event: null,
        scope: plan.scope,
        removed: (event.dates || []).length,
        targets: event.dates || [],
      };
    }
    for (const row of plan.targets) {
      if (row?.id) await removeOccurrence(env, row.id);
    }
    const updated = await updateEvent(env, eventId, { endsOn });
    return {
      deleted: false,
      event: updated,
      scope: plan.scope,
      removed: plan.targets.length,
      targets: plan.targets,
    };
  }

  // skip this night
  if (!expandSeriesOccurrenceDates(event).includes(plan.date)) {
    const error = new Error(
      "Choose an upcoming occurrence from this event schedule.",
    );
    error.status = 400;
    throw error;
  }
  for (const row of plan.targets) {
    if (row?.id) await removeOccurrence(env, row.id);
  }
  const skippedDates = normalizeSkippedDates([
    ...(event.skippedDates || []),
    plan.date,
  ]);
  const updated = await updateEvent(env, eventId, { skippedDates });
  if (!expandSeriesOccurrenceDates(updated).length) {
    await deleteEvent(env, eventId);
    return {
      deleted: true,
      event: null,
      scope: "this",
      removed: plan.targets.length || 1,
      targets: plan.targets,
    };
  }
  return {
    deleted: false,
    event: updated,
    scope: "this",
    removed: plan.targets.length || 1,
    targets: plan.targets,
  };
}

function absoluteFileUrl(env, url) {
  const raw = text(url);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = baserowApiBase(env);
  return `${base}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

async function bytesFromImage(env, image) {
  const url = absoluteFileUrl(env, image?.url);
  if (!url) {
    const error = new Error("Hero image has no file URL.");
    error.status = 502;
    throw error;
  }
  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error(`Could not read the hero image (${response.status}).`);
    error.status = 502;
    throw error;
  }
  const bytes = await response.arrayBuffer();
  const contentType = String(response.headers.get("content-type") || "")
    .split(";")[0]
    .trim();
  return { bytes, contentType, filename: image?.name || "" };
}

/**
 * Replace the hero copy in the series Drive folder.
 * `match` selects the previous file for this slot (series, or one night).
 */
async function putHeroDriveCopy(env, eventId, bytes, { name, contentType, match }) {
  const event = await ensureEventDriveFolder(env, eventId);
  const uploaded = await uploadDriveFile(env, {
    name,
    parentId: event.driveFolderId,
    bytes,
    contentType: contentType || "image/jpeg",
  });
  const children = await listDriveChildren(env, event.driveFolderId);
  for (const file of children) {
    if (!file?.id || file.id === uploaded.id) continue;
    if (!match(file)) continue;
    await trashDriveFile(env, file.id);
  }
  return uploaded;
}

async function removeHeroDriveCopies(env, eventId, match) {
  let event;
  try {
    event = await getEvent(env, eventId);
  } catch (error) {
    if (error?.status === 404) return;
    throw error;
  }
  if (!event.driveFolderId) return;
  const children = await listDriveChildren(env, event.driveFolderId);
  for (const file of children) {
    if (file?.id && match(file)) await trashDriveFile(env, file.id);
  }
}

async function copySeriesHero(env, eventId, bytes, { filename, contentType }) {
  return putHeroDriveCopy(env, eventId, bytes, {
    name: seriesHeroDriveName(filename, contentType),
    contentType,
    match: (file) => isSeriesHeroDriveName(file?.name),
  });
}

async function copyOccurrenceHero(env, eventId, date, bytes, { filename, contentType }) {
  return putHeroDriveCopy(env, eventId, bytes, {
    name: occurrenceHeroDriveName(date, filename, contentType),
    contentType,
    match: (file) => isOccurrenceHeroDriveName(file?.name, date),
  });
}

async function renameOccurrenceHeroCopy(env, eventId, fromDate, toDate) {
  if (!fromDate || !toDate || fromDate === toDate) return;
  const event = await getEvent(env, eventId);
  if (!event.driveFolderId) return;
  const children = await listDriveChildren(env, event.driveFolderId);
  for (const file of children) {
    if (!file?.id || !isOccurrenceHeroDriveName(file.name, fromDate)) continue;
    const ext = String(file.name).split(".").pop();
    await renameDriveFile(env, file.id, `hero-${toDate}.${ext}`);
  }
}

/** Copy heroes already stored in Baserow into each series Drive folder. */
export async function copyStoredHeroesToDrive(env) {
  const events = await listEvents(env);
  const copied = [];
  const skipped = [];
  for (const event of events) {
    const jobs = [];
    if (event.mainImage?.url) {
      jobs.push({ kind: "series", image: event.mainImage, date: "" });
    }
    for (const night of event.dates || []) {
      const image = night.overrides?.image;
      if (!image?.url) continue;
      jobs.push({ kind: "night", image, date: night.date });
    }
    if (!jobs.length) continue;
    if (!event.driveFolderId) {
      skipped.push({ id: event.id, name: event.name, reason: "no Drive folder" });
      continue;
    }
    for (const job of jobs) {
      const file = await bytesFromImage(env, job.image);
      if (job.kind === "series") {
        await copySeriesHero(env, event.id, file.bytes, {
          filename: file.filename,
          contentType: file.contentType,
        });
      } else {
        await copyOccurrenceHero(env, event.id, job.date, file.bytes, {
          filename: file.filename,
          contentType: file.contentType,
        });
      }
      copied.push({
        id: event.id,
        name: event.name,
        kind: job.kind,
        date: job.date,
      });
    }
  }
  return { copied, skipped };
}

async function attachFiles(env, tables, id, field, entries, extra = {}) {
  const row = await updateRow(env, tables.events, id, {
    [field]: entries.map((entry) => ({ name: entry.name })),
    ...extra,
  });
  const dates = await loadDates(env, tables, id);
  return mapEvent(row, dates);
}

export async function setEventImage(
  env,
  id,
  bytes,
  { filename, contentType, role },
) {
  const tables = requireEventsTables(await resolveOpsTableIds(env));
  const existing = await getEvent(env, id);
  const uploaded = await uploadUserFile(env, bytes, { filename, contentType });
  if (role === "gallery") {
    const names = [
      ...existing.images
        .map((image) => ({ name: image.name }))
        .filter((image) => image.name),
      { name: uploaded.name },
    ];
    return attachFiles(env, tables, id, "Images", names);
  }
  const event = await attachFiles(env, tables, id, "Main image", [{ name: uploaded.name }], {
    "Hero crops": "",
  });
  await copySeriesHero(env, id, bytes, { filename, contentType });
  return event;
}

export async function clearEventImage(env, id, { role, name }) {
  const tables = requireEventsTables(await resolveOpsTableIds(env));
  const existing = await getEvent(env, id);
  if (role === "gallery") {
    const names = existing.images
      .filter((image) => image.name && image.name !== name)
      .map((image) => ({ name: image.name }));
    return attachFiles(env, tables, id, "Images", names);
  }
  const event = await attachFiles(env, tables, id, "Main image", [], {
    "Hero crops": "",
  });
  await removeHeroDriveCopies(env, id, (file) => isSeriesHeroDriveName(file?.name));
  return event;
}

/** Baserow fields for one night row (shared by single and batch saves). */
async function occurrenceFields(env, eventId, occurrence) {
  const fields = {
    Name: occurrence.label,
    Event: [Number(eventId)],
    Date: occurrence.date,
    Slug: occurrence.slug,
    "Sanity ID": occurrence.sanityId || "",
    "ClickUp Task ID": occurrence.clickupTaskId || "",
    "Publish snapshots": JSON.stringify(occurrence.snapshots || {}),
  };
  if (occurrence.overrides !== undefined) {
    fields["Title override"] = text(occurrence.overrides?.name);
    fields["Artist override"] = text(occurrence.overrides?.artist);
    fields["Offer override"] = text(occurrence.overrides?.offer);
    fields["Description override"] = text(occurrence.overrides?.description);
    const dateFields = await eventDateFieldNames(env);
    if (dateFields.has(SHORT_DESCRIPTION_OVERRIDE_FIELD)) {
      fields[SHORT_DESCRIPTION_OVERRIDE_FIELD] = text(
        occurrence.overrides?.shortDescription,
      );
    }
    fields["Time override"] = text(occurrence.overrides?.time);
    fields["Start time override"] = clockTime(occurrence.overrides?.startTime);
    fields["End time override"] = clockTime(occurrence.overrides?.endTime);
    const overrideField = await nightScheduleOverrideFieldName(env);
    if (overrideField) {
      fields[overrideField] =
        occurrence.overrides?.nightSchedule == null
          ? ""
          : serializeNightSchedule(occurrence.overrides.nightSchedule);
    }
    fields["Operations notes override"] = text(
      occurrence.overrides?.operationsNotes,
    );
    fields["Image links override"] = linksFrom(
      occurrence.overrides?.imageLinks,
    ).join("\n");
    fields["Override image"] = occurrence.overrides?.image?.name
      ? [{ name: occurrence.overrides.image.name }]
      : [];
    fields["Override hero crops"] =
      occurrence.overrides?.heroCrops == null
        ? ""
        : typeof occurrence.overrides.heroCrops === "string"
          ? occurrence.overrides.heroCrops
          : JSON.stringify(occurrence.overrides.heroCrops);
  }
  return fields;
}

export async function saveOccurrence(env, eventId, occurrence) {
  const tables = requireEventsTables(await resolveOpsTableIds(env));
  const fields = await occurrenceFields(env, eventId, occurrence);
  if (occurrence.id) {
    return mapEventDate(
      await updateRow(env, tables.eventDates, occurrence.id, fields),
    );
  }
  return mapEventDate(await createRow(env, tables.eventDates, fields));
}

/**
 * Save many nights: existing rows in one batch request (Baserow allows 200),
 * new rows one by one. Keeps a series save inside Cloudflare's call limit.
 */
export async function saveOccurrences(env, eventId, occurrences) {
  const list = (occurrences || []).filter(Boolean);
  if (!list.length) return;
  const tables = requireEventsTables(await resolveOpsTableIds(env));
  const existing = [];
  for (const occurrence of list) {
    if (occurrence.id) {
      existing.push({ id: Number(occurrence.id), ...(await occurrenceFields(env, eventId, occurrence)) });
    } else {
      await createRow(env, tables.eventDates, await occurrenceFields(env, eventId, occurrence));
    }
  }
  for (let i = 0; i < existing.length; i += 200) {
    await baserowFetch(
      env,
      `/api/database/rows/table/${tables.eventDates}/batch/?user_field_names=true`,
      { method: "PATCH", body: JSON.stringify({ items: existing.slice(i, i + 200) }) },
    );
  }
}

/** Ensure a calendar night exists on the series, even outside the recurrence rule. */
export async function ensureOccurrence(env, eventId, date, overrides = {}) {
  const event = await getEvent(env, eventId);
  const normalized = isoDate(date);
  if (!normalized) {
    const error = new Error("Date is required.");
    error.status = 400;
    throw error;
  }
  const existing = event.dates.find((row) => row.date === normalized);
  if (existing) {
    if (!hasOccurrenceInput(overrides) && !overrides.image) {
      return { event, occurrence: existing, created: false };
    }
    const occurrence = await saveOccurrence(env, eventId, {
      date: normalized,
      slug: occurrenceSlug(event.slug, normalized),
      label: `${titleOverrideForSave(event.name, overrides.name) || event.name} · ${normalized}`,
      overrides: {
        name: titleOverrideForSave(event.name, overrides.name),
        artist: text(overrides.artist),
        offer: text(overrides.offer),
        description: text(overrides.description),
        shortDescription: text(overrides.shortDescription),
        time: text(overrides.time),
        startTime: clockTime(overrides.startTime),
        endTime: clockTime(overrides.endTime),
        nightSchedule:
          overrides.nightSchedule == null
            ? null
            : parseNightSchedule(overrides.nightSchedule),
        operationsNotes: text(overrides.operationsNotes),
        imageLinks: linksFrom(overrides.imageLinks),
        image: overrides.image || existing.overrides?.image || null,
      },
    });
    return {
      event: await getEvent(env, eventId),
      occurrence,
      created: false,
    };
  }
  const wanted = expandSeriesOccurrenceDates(event);
  let series = event;
  if (!wanted.includes(normalized)) {
    const unit = String(event.repeatUnit || "none").toLowerCase();
    const openScheduled =
      (unit === "none" || unit === "") && !isoDate(event.startsOn);
    series = await updateEvent(
      env,
      eventId,
      openScheduled
        ? {
            startsOn: normalized,
            skippedDates: normalizeSkippedDates(event.skippedDates).filter(
              (item) => item !== normalized,
            ),
          }
        : {
            extraDates: normalizeExtraDates([
              ...(event.extraDates || []),
              normalized,
            ]),
            skippedDates: normalizeSkippedDates(event.skippedDates).filter(
              (item) => item !== normalized,
            ),
          },
    );
    const created = series.dates.find((row) => row.date === normalized);
    if (created && !hasOccurrenceInput(overrides) && !overrides.image) {
      return { event: series, occurrence: created, created: true };
    }
  }
  const occurrence = await saveOccurrence(env, eventId, {
    date: normalized,
    slug: occurrenceSlug(series.slug, normalized),
    label: `${titleOverrideForSave(series.name, overrides.name) || series.name} · ${normalized}`,
    overrides: {
      name: titleOverrideForSave(series.name, overrides.name),
      artist: text(overrides.artist),
      offer: text(overrides.offer),
      description: text(overrides.description),
      shortDescription: text(overrides.shortDescription),
      time: text(overrides.time),
      startTime: clockTime(overrides.startTime),
      endTime: clockTime(overrides.endTime),
      operationsNotes: text(overrides.operationsNotes),
      imageLinks: linksFrom(overrides.imageLinks),
      image: overrides.image || null,
    },
  });
  return {
    event: await getEvent(env, eventId),
    occurrence,
    created: true,
  };
}

/**
 * Move a night onto another series (Baserow Events row), keeping overrides.
 */
export async function assignOccurrenceToSeries(
  env,
  fromEventId,
  date,
  toEventId,
  input = {},
) {
  const fromId = String(fromEventId || "").trim();
  const toId = String(toEventId || "").trim();
  const fromDate = isoDate(date);
  if (!fromId || !toId || !fromDate) {
    const error = new Error("Series and date are required.");
    error.status = 400;
    throw error;
  }
  if (fromId === toId) {
    return updateOccurrenceContent(env, fromId, fromDate, {
      ...input,
      scope: "this",
    });
  }

  const fromEvent = await getEvent(env, fromId);
  const existing = fromEvent.dates.find((row) => row.date === fromDate);
  if (!existing) {
    const error = new Error("Occurrence not found.");
    error.status = 404;
    throw error;
  }

  const resolved = resolveOccurrenceContent(fromEvent, existing);
  const toDate = isoDate(input?.date) || fromDate;
  const overrides = {
    name: text(input?.name !== undefined ? input.name : resolved.name),
    artist: text(input?.artist !== undefined ? input.artist : resolved.artist),
    offer: text(input?.offer !== undefined ? input.offer : resolved.offer),
    description: text(
      input?.description !== undefined
        ? input.description
        : resolved.description,
    ),
    shortDescription: text(
      input?.shortDescription !== undefined
        ? input.shortDescription
        : resolved.shortDescription,
    ),
    operationsNotes: text(
      input?.operationsNotes !== undefined
        ? input.operationsNotes
        : resolved.operationsNotes,
    ),
    imageLinks:
      input?.imageLinks !== undefined
        ? linksFrom(input.imageLinks)
        : resolved.imageLinks || [],
    time: text(input?.time !== undefined ? input.time : resolved.time),
    startTime: clockTime(
      input?.startTime !== undefined ? input.startTime : resolved.startTime,
    ),
    endTime: clockTime(
      input?.endTime !== undefined ? input.endTime : resolved.endTime,
    ),
    image: existing.overrides?.image || null,
  };

  const created = await ensureOccurrence(env, toId, toDate, overrides);
  await detachOccurrenceFromSeries(env, fromEvent, existing);

  let sourceDeleted = false;
  try {
    await getEvent(env, fromId);
  } catch (error) {
    if (error?.status === 404) sourceDeleted = true;
    else throw error;
  }

  return {
    event: created.event,
    occurrence: created.occurrence,
    assignedTo: toId,
    movedFrom: fromDate,
    movedTo: toDate,
    updated: 1,
    scope: "this",
    sourceDeleted,
  };
}

/** Drop one night from a series without using the public delete scopes. */
async function detachOccurrenceFromSeries(env, event, occurrence) {
  const date = occurrence.date;
  if (occurrence?.id) {
    await removeOccurrence(env, occurrence.id);
  }
  const remaining = (event.dates || []).filter((row) => row.date !== date);
  const unit = String(event.repeatUnit || "none").toLowerCase();
  if (!remaining.length) {
    await deleteEvent(env, event.id);
    return null;
  }
  if (unit === "none" || unit === "") {
    return updateEvent(env, event.id, {
      startsOn: remaining[0].date,
      extraDates: remaining.slice(1).map((row) => row.date),
      skippedDates: normalizeSkippedDates(event.skippedDates).filter(
        (item) => item !== date,
      ),
    });
  }
  const inRule = expandSeriesOccurrenceDates({
    ...event,
    skippedDates: [],
    extraDates: [],
  }).includes(date);
  return updateEvent(env, event.id, {
    skippedDates: inRule
      ? normalizeSkippedDates([...(event.skippedDates || []), date])
      : normalizeSkippedDates(event.skippedDates).filter(
          (item) => item !== date,
        ),
    extraDates: normalizeExtraDates(event.extraDates).filter(
      (item) => item !== date,
    ),
  });
}

function hasOccurrenceInput(overrides) {
  if (!overrides || typeof overrides !== "object") return false;
  return [
    "name",
    "artist",
    "offer",
    "description",
    "shortDescription",
    "time",
    "startTime",
    "endTime",
    "operationsNotes",
    "imageLinks",
  ].some((key) => overrides[key] !== undefined && overrides[key] !== "");
}

function requireOccurrenceDate(event, date) {
  const normalized = isoDate(date);
  if (!normalized) {
    const error = new Error(
      "Choose an upcoming occurrence from this event schedule.",
    );
    error.status = 400;
    throw error;
  }
  const allowed = new Set(expandSeriesOccurrenceDates(event));
  for (const row of event.dates || []) {
    if (row?.date) allowed.add(row.date);
  }
  if (!allowed.has(normalized)) {
    const error = new Error(
      "Choose an upcoming occurrence from this event schedule.",
    );
    error.status = 400;
    throw error;
  }
  return normalized;
}

async function occurrenceForDate(env, eventId, date) {
  const event = await getEvent(env, eventId);
  const normalized = requireOccurrenceDate(event, date);
  return {
    event,
    date: normalized,
    occurrence: event.dates.find((row) => row.date === normalized) || null,
  };
}

export async function updateOccurrenceContent(env, eventId, date, input) {
  const targetSeriesId = String(
    input?.seriesId || input?.targetEventId || "",
  ).trim();
  if (targetSeriesId && targetSeriesId !== String(eventId)) {
    return assignOccurrenceToSeries(env, eventId, date, targetSeriesId, input);
  }
  const {
    event,
    date: normalized,
    occurrence,
  } = await occurrenceForDate(env, eventId, date);
  if (!occurrence) {
    const error = new Error("Occurrence not found.");
    error.status = 404;
    throw error;
  }
  const scope = ["this", "following", "all"].includes(input?.scope)
    ? input.scope
    : "this";
  const nextDate = isoDate(input?.date) || normalized;
  if (nextDate !== normalized) {
    if (scope !== "this") {
      const error = new Error(
        "Moving a night only applies to this event, not following nights.",
      );
      error.status = 400;
      throw error;
    }
    return moveOccurrence(env, eventId, normalized, nextDate, input);
  }
  const today = todayIso();
  const targets = event.dates.filter((row) => {
    if (scope === "this") return row.date === normalized;
    if (scope === "following") return row.date >= normalized;
    return row.date >= today;
  });
  const current = resolveOccurrenceContent(event, occurrence);
  const startTime =
    input?.startTime !== undefined
      ? clockTime(input.startTime)
      : current.startTime;
  const endTime =
    input?.endTime !== undefined ? clockTime(input.endTime) : current.endTime;
  if (input?.startTime && !startTime) {
    const error = new Error("Start time must use 24-hour HH:mm.");
    error.status = 400;
    throw error;
  }
  if (input?.endTime && !endTime) {
    const error = new Error("End time must use 24-hour HH:mm.");
    error.status = 400;
    throw error;
  }
  const imageLinks =
    input?.imageLinks !== undefined
      ? linksFrom(input.imageLinks)
      : current.imageLinks;
  const invalid = imageLinks.find((link) => !/^https?:\/\/\S+$/i.test(link));
  if (invalid) {
    const error = new Error(
      `Image link must start with http:// or https://: ${invalid}`,
    );
    error.status = 400;
    throw error;
  }
  const overrides = {
    name: titleOverrideForSave(
      event.name,
      input?.name !== undefined ? text(input.name) : current.title,
    ),
    artist: input?.artist !== undefined ? text(input.artist) : current.artist,
    offer: input?.offer !== undefined ? text(input.offer) : current.offer,
    description:
      input?.description !== undefined
        ? text(input.description)
        : current.description,
    shortDescription:
      input?.shortDescription !== undefined
        ? text(input.shortDescription)
        : current.shortDescription,
    time: input?.time !== undefined ? text(input.time) : current.time,
    startTime,
    endTime,
    nightSchedule:
      input?.nightSchedule !== undefined
        ? parseNightSchedule(input.nightSchedule)
        : occurrence.overrides?.nightSchedule != null
          ? parseNightSchedule(occurrence.overrides.nightSchedule)
          : null,
    operationsNotes:
      input?.operationsNotes !== undefined
        ? text(input.operationsNotes)
        : current.operationsNotes,
    imageLinks,
    image: occurrence.overrides?.image || null,
    heroCrops:
      input?.heroCrops !== undefined
        ? input.heroCrops
        : occurrence.overrides?.heroCrops || null,
  };
  if (scope === "all" || scope === "following") {
    const baselineCutoff = scope === "all" ? today : normalized;
    for (const row of event.dates.filter(
      (item) => item.date < baselineCutoff,
    )) {
      const content = resolveOccurrenceContent(event, row);
      await saveOccurrence(env, eventId, {
        ...row,
        label: `${content.title || event.name} · ${row.date}`,
        overrides: {
          name: titleOverrideForSave(event.name, content.title),
          artist: content.artist,
          offer: content.offer,
          description: content.description,
          time: content.time,
          startTime: content.startTime,
          endTime: content.endTime,
          nightSchedule: row.overrides?.nightSchedule ?? null,
          operationsNotes: content.operationsNotes,
          imageLinks: content.imageLinks,
          // Keep a real per-night flyer only. Never bake the series main image
          // into Override image (that falsely creates "special guests").
          image: row.overrides?.image || null,
          heroCrops: row.overrides?.heroCrops || null,
        },
      });
    }
    await updateEvent(env, eventId, {
      name: overrides.name || event.name,
      artist: overrides.artist,
      offer: overrides.offer,
      description: overrides.description,
      time: overrides.time,
      startTime: overrides.startTime,
      endTime: overrides.endTime,
      nightSchedule: overrides.nightSchedule ?? event.nightSchedule,
      operationsNotes: overrides.operationsNotes,
      imageLinks: overrides.imageLinks,
    });
    let saved = occurrence;
    for (const row of targets) {
      saved = await saveOccurrence(env, eventId, {
        ...row,
        label: `${overrides.name || event.name} · ${row.date}`,
        overrides: {
          name: "",
          artist: "",
          offer: "",
          description: "",
          time: "",
          startTime: "",
          endTime: "",
          nightSchedule: null,
          operationsNotes: "",
          imageLinks: [],
          image: row.overrides?.image || null,
          heroCrops: row.overrides?.heroCrops || null,
        },
      });
    }
    return {
      event: await getEvent(env, eventId),
      occurrence: saved,
      updated: targets.length,
      scope,
    };
  }
  let saved = occurrence;
  for (const row of targets) {
    saved = await saveOccurrence(env, eventId, {
      ...row,
      label: `${overrides.name || event.name} · ${row.date}`,
      overrides: {
        ...row.overrides,
        ...overrides,
        image: row.overrides?.image || null,
      },
    });
  }
  return {
    event: await getEvent(env, eventId),
    occurrence: saved,
    updated: targets.length,
    scope,
  };
}

/** Move one night to another date without changing Starts on / Ends on. */
export async function moveOccurrence(
  env,
  eventId,
  fromDate,
  toDate,
  input = {},
) {
  const event = await getEvent(env, eventId);
  const from = requireOccurrenceDate(event, fromDate);
  const to = isoDate(toDate);
  if (!to) {
    const error = new Error("Date is not valid.");
    error.status = 400;
    throw error;
  }
  const plan = planOccurrenceMove(event, from, to);
  if (!plan.ok) {
    const error = new Error(plan.error || "Date is not valid.");
    error.status = 400;
    throw error;
  }
  const fromOccurrence = event.dates.find((row) => row.date === from) || null;
  if (!fromOccurrence) {
    const error = new Error("Occurrence not found.");
    error.status = 404;
    throw error;
  }
  const current = resolveOccurrenceContent(event, fromOccurrence);
  const startTime =
    input?.startTime !== undefined
      ? clockTime(input.startTime)
      : current.startTime;
  const endTime =
    input?.endTime !== undefined ? clockTime(input.endTime) : current.endTime;
  if (input?.startTime && !startTime) {
    const error = new Error("Start time must use 24-hour HH:mm.");
    error.status = 400;
    throw error;
  }
  if (input?.endTime && !endTime) {
    const error = new Error("End time must use 24-hour HH:mm.");
    error.status = 400;
    throw error;
  }
  const imageLinks =
    input?.imageLinks !== undefined
      ? linksFrom(input.imageLinks)
      : current.imageLinks;
  const overrides = {
    name: titleOverrideForSave(
      event.name,
      input?.name !== undefined ? text(input.name) : current.title,
    ),
    artist: input?.artist !== undefined ? text(input.artist) : current.artist,
    offer: input?.offer !== undefined ? text(input.offer) : current.offer,
    description:
      input?.description !== undefined
        ? text(input.description)
        : current.description,
    shortDescription:
      input?.shortDescription !== undefined
        ? text(input.shortDescription)
        : current.shortDescription,
    time: input?.time !== undefined ? text(input.time) : current.time,
    startTime,
    endTime,
    operationsNotes:
      input?.operationsNotes !== undefined
        ? text(input.operationsNotes)
        : current.operationsNotes,
    imageLinks,
    image: fromOccurrence.overrides?.image || null,
  };

  if (plan.unchanged) {
    return updateOccurrenceContent(env, eventId, from, {
      ...input,
      date: from,
      scope: "this",
    });
  }

  if (plan.oneOff) {
    await updateEvent(env, eventId, {
      startsOn: plan.startsOn,
      name: overrides.name || event.name,
      artist: overrides.artist,
      offer: overrides.offer,
      description: overrides.description,
      time: overrides.time,
      startTime: overrides.startTime,
      endTime: overrides.endTime,
      operationsNotes: overrides.operationsNotes,
      imageLinks: overrides.imageLinks,
    });
    const updated = await getEvent(env, eventId);
    const occurrence =
      updated.dates.find((row) => row.date === to) || updated.dates[0] || null;
    if (fromOccurrence.overrides?.image) {
      await renameOccurrenceHeroCopy(env, eventId, from, to);
    }
    return {
      event: updated,
      occurrence,
      updated: 1,
      scope: "this",
      movedFrom: from,
      movedTo: to,
    };
  }

  const clash = event.dates.find(
    (row) => row.date === to && String(row.id) !== String(fromOccurrence.id),
  );
  await updateEvent(env, eventId, {
    skippedDates: plan.skippedDates,
    extraDates: plan.extraDates,
  });
  let series = await getEvent(env, eventId);
  let target = series.dates.find((row) => row.date === to) || clash || null;
  if (!target) {
    target = await saveOccurrence(env, eventId, {
      date: to,
      slug: occurrenceSlug(series.slug, to),
      label: `${overrides.name || series.name} · ${to}`,
      overrides: {
        ...overrides,
        image: overrides.image,
      },
    });
  } else {
    target = await saveOccurrence(env, eventId, {
      ...target,
      date: to,
      slug: occurrenceSlug(series.slug, to),
      label: `${overrides.name || series.name} · ${to}`,
      overrides: {
        ...target.overrides,
        ...overrides,
        image: overrides.image || target.overrides?.image || null,
      },
    });
  }
  const leftover = series.dates.find((row) => row.date === from);
  if (leftover?.id) {
    await removeOccurrence(env, leftover.id);
  }
  series = await getEvent(env, eventId);
  if (fromOccurrence.overrides?.image) {
    await renameOccurrenceHeroCopy(env, eventId, from, to);
  }
  return {
    event: series,
    occurrence: series.dates.find((row) => row.date === to) || target,
    updated: 1,
    scope: "this",
    movedFrom: from,
    movedTo: to,
  };
}

export async function setOccurrenceImage(
  env,
  eventId,
  date,
  bytes,
  { filename, contentType },
) {
  const {
    event,
    date: normalized,
    occurrence,
  } = await occurrenceForDate(env, eventId, date);
  const tables = requireEventsTables(await resolveOpsTableIds(env));
  const uploaded = await uploadUserFile(env, bytes, { filename, contentType });
  const saved = await saveOccurrence(env, eventId, {
    ...(occurrence || {}),
    date: normalized,
    slug: occurrence?.slug || occurrenceSlug(event.slug, normalized),
    label: `${event.name} · ${normalized}`,
    overrides: {
      ...(occurrence?.overrides || {}),
      image: { name: uploaded.name, url: uploaded.url || "" },
      heroCrops: null,
    },
  });
  let occurrenceSaved = saved;
  if (!saved.overrides.image?.url) {
    const row = await updateRow(env, tables.eventDates, saved.id, {
      "Override image": [{ name: uploaded.name }],
      "Override hero crops": "",
    });
    occurrenceSaved = mapEventDate(row);
  }
  await copyOccurrenceHero(env, eventId, normalized, bytes, { filename, contentType });
  return { event: await getEvent(env, eventId), occurrence: occurrenceSaved };
}

export async function clearOccurrenceImage(env, eventId, date) {
  const {
    event,
    date: normalized,
    occurrence,
  } = await occurrenceForDate(env, eventId, date);
  if (!occurrence) {
    return { event, occurrence: null };
  }
  const saved = await saveOccurrence(env, eventId, {
    ...occurrence,
    date: normalized,
    label: `${event.name} · ${normalized}`,
    overrides: { ...occurrence.overrides, image: null, heroCrops: null },
  });
  await removeHeroDriveCopies(env, eventId, (file) =>
    isOccurrenceHeroDriveName(file?.name, normalized),
  );
  return { event: await getEvent(env, eventId), occurrence: saved };
}

export async function removeOccurrence(env, id) {
  const tables = requireEventsTables(await resolveOpsTableIds(env));
  let warnings = [];
  try {
    const row = await getRow(env, tables.eventDates, id);
    warnings = await forgetCalendarOccurrences(env, [
      {
        id: String(row.id),
        date: isoDate(row.Date),
        googleCalendarEventId:
          text(row["Google calendar event id"]) || calendarLinkValue(row.Notes),
      },
    ]);
  } catch (error) {
    if (error?.status !== 404) {
      warnings = [
        noteCalendarWarning(
          env,
          error?.message ||
            "Could not remove that night from Google Calendar.",
        ),
      ];
    }
  }
  try {
    await deleteRow(env, tables.eventDates, id);
  } catch (error) {
    if (error?.status !== 404) throw error;
  }
  return warnings;
}

/**
 * Update only "Publish snapshots" on many night rows in one request
 * (Baserow batch update, up to 200 rows per call).
 */
export async function saveOccurrenceSnapshots(env, updates) {
  if (!updates?.length) return 0;
  const tables = requireEventsTables(await resolveOpsTableIds(env));
  for (let i = 0; i < updates.length; i += 200) {
    await baserowFetch(
      env,
      `/api/database/rows/table/${tables.eventDates}/batch/?user_field_names=true`,
      {
        method: "PATCH",
        body: JSON.stringify({
          items: updates.slice(i, i + 200).map((row) => ({
            id: row.id,
            "Publish snapshots": JSON.stringify(row.snapshots || {}),
          })),
        }),
      },
    );
  }
  return updates.length;
}
