/**
 * Push ops nights onto the configured Google Calendar, and remove them
 * when the night row goes away. Calendar failures are warnings.
 */
import {
  baserowFetch,
  resolveOpsTableIds,
  updateRow,
} from "./baserow.js";
import { OPS_CONFIG_KEYS, getConfigString, siteEnvName } from "./config-store.js";
import { resolveOccurrenceContent } from "./event-content.js";
import { todayIso } from "./event-recurrence.js";
import { parseDriveServiceAccount } from "./google-drive.js";
import {
  CALENDAR_SYNC_LIMIT,
  buildCalendarEvent,
  calendarEventHash,
  calendarLinkValue,
  chooseCalendarEvent,
  deleteCalendarEvent,
  eventFallsOnDate,
  formatCalendarLink,
  insertCalendarEvent,
  listCalendarEvents,
  normalizeCalendarId,
  parseCalendarLink,
  patchCalendarEvent,
} from "./google-calendar.js";

export const GOOGLE_CALENDAR_EVENT_FIELD = "Google calendar event id";
const CALENDAR_LINK_NOTES_FIELD = "Notes";

let fieldCache = { key: "", at: 0, names: null, tableId: "" };

export function noteCalendarWarning(env, message) {
  const text = String(message || "").trim();
  if (!text) return text;
  const bucket = env?.__gwendaCalendarWarnings;
  if (Array.isArray(bucket) && !bucket.includes(text)) bucket.push(text);
  return text;
}

export function attachCalendarWarnings(env, body) {
  const extra = Array.isArray(env?.__gwendaCalendarWarnings)
    ? env.__gwendaCalendarWarnings.filter(Boolean)
    : [];
  if (!extra.length) return body || {};
  const prior = Array.isArray(body?.warnings) ? body.warnings : [];
  const warnings = [...prior];
  for (const item of extra) {
    if (!warnings.includes(item)) warnings.push(item);
  }
  return { ...(body || {}), warnings };
}

function shiftIso(iso, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!match) return "";
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  date.setUTCDate(date.getUTCDate() + days);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function configuredCalendarId(env) {
  try {
    const fromConfig = normalizeCalendarId(
      await getConfigString(env, OPS_CONFIG_KEYS.googleCalendarId),
    );
    if (fromConfig) return fromConfig;
  } catch (error) {
    if (error?.status !== 503) throw error;
  }
  if (siteEnvName(env) === "production") {
    return normalizeCalendarId(env?.GOOGLE_CALENDAR_ID);
  }
  if (siteEnvName(env) === "local") {
    return normalizeCalendarId(env?.GOOGLE_CALENDAR_ID_LOCAL);
  }
  return "";
}

async function calendarReady(env) {
  const calendarId = await configuredCalendarId(env);
  if (!calendarId) return { calendarId: "", ready: false };
  if (!parseDriveServiceAccount(env)) {
    noteCalendarWarning(
      env,
      "Google Calendar is set, but the service account is missing.",
    );
    return { calendarId, ready: false };
  }
  return { calendarId, ready: true };
}

async function eventDateFields(env) {
  const tables = await resolveOpsTableIds(env);
  const tableId = tables.eventDates ? String(tables.eventDates) : "";
  if (!tableId) return { tableId: "", names: new Set() };
  const key = tableId;
  if (
    fieldCache.names &&
    fieldCache.key === key &&
    Date.now() - fieldCache.at < 60_000
  ) {
    return { tableId, names: fieldCache.names };
  }
  const fields = await baserowFetch(
    env,
    `/api/database/fields/table/${tableId}/`,
  );
  const names = new Set((fields || []).map((field) => field.name));
  fieldCache = { key, at: Date.now(), names, tableId };
  return { tableId, names };
}

function occurrenceFromRow(row) {
  return {
    id: row?.id ? String(row.id) : "",
    date: String(row?.date || row?.Date || "").slice(0, 10),
    googleCalendarEventId: String(
      row?.googleCalendarEventId ||
        row?.[GOOGLE_CALENDAR_EVENT_FIELD] ||
        calendarLinkValue(row?.Notes) ||
        "",
    ).trim(),
  };
}

export async function forgetCalendarOccurrences(env, occurrences) {
  const { calendarId, ready } = await calendarReady(env);
  if (!calendarId || !ready) return [];
  const warnings = [];
  for (const row of occurrences || []) {
    const occurrence = occurrenceFromRow(row);
    const link = parseCalendarLink(occurrence.googleCalendarEventId);
    if (!link.id) continue;
    try {
      await deleteCalendarEvent(env, calendarId, link.id);
    } catch (error) {
      const message = noteCalendarWarning(
        env,
        `Could not remove ${occurrence.date || "a night"} from Google Calendar. ${error?.message || "Request failed."}`,
      );
      warnings.push(message);
    }
  }
  return warnings;
}

async function writeCalendarLink(env, tableId, fieldName, occurrenceId, eventId, hash) {
  const value = formatCalendarLink(eventId, hash);
  const fields = { [fieldName]: value };
  if (fieldName === GOOGLE_CALENDAR_EVENT_FIELD) fields[CALENDAR_LINK_NOTES_FIELD] = "";
  await updateRow(env, tableId, occurrenceId, fields);
}

async function saveGoogleEvent(env, calendarId, body, existingId) {
  if (!existingId) {
    const created = await insertCalendarEvent(env, calendarId, body);
    return created?.id || "";
  }
  try {
    const updated = await patchCalendarEvent(
      env,
      calendarId,
      existingId,
      body,
    );
    return updated?.id || existingId;
  } catch (error) {
    if (error?.status !== 404 && error?.status !== 410) throw error;
    const created = await insertCalendarEvent(env, calendarId, body);
    return created?.id || "";
  }
}

export async function syncSeriesCalendar(env, event) {
  if (!event?.id) return { event, warnings: [] };
  const { calendarId, ready } = await calendarReady(env);
  if (!calendarId || !ready) return { event, warnings: [] };

  const { tableId, names } = await eventDateFields(env);
  const linkField = names.has(GOOGLE_CALENDAR_EVENT_FIELD)
    ? GOOGLE_CALENDAR_EVENT_FIELD
    : names.has(CALENDAR_LINK_NOTES_FIELD)
      ? CALENDAR_LINK_NOTES_FIELD
      : "";
  if (!linkField) {
    noteCalendarWarning(
      env,
      "Google Calendar could not store event ids on the night rows.",
    );
  }

  const today = todayIso();
  const future = (event.dates || [])
    .filter((row) => row?.date && row.date >= today && row.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const nights = future.slice(0, CALENDAR_SYNC_LIMIT);
  if (future.length > nights.length) {
    noteCalendarWarning(
      env,
      `Only the next ${CALENDAR_SYNC_LIMIT} nights were sent to Google Calendar.`,
    );
  }

  const needsList = nights.some(
    (row) => !parseCalendarLink(row.googleCalendarEventId).id,
  );
  let listed = [];
  if (needsList && nights.length) {
    const first = nights[0].date;
    const last = nights[nights.length - 1].date;
    listed = await listCalendarEvents(env, calendarId, {
      timeMin: `${shiftIso(first, -1)}T00:00:00Z`,
      timeMax: `${shiftIso(last, 2)}T00:00:00Z`,
    });
  }

  const usedIds = new Set();
  for (const row of nights) {
    const content = resolveOccurrenceContent(event, row);
    const googleEvent = buildCalendarEvent({
      occurrenceId: row.id,
      title: content.title,
      artist: content.artist,
      offer: content.offer,
      description: content.description,
      nightSchedule: content.nightSchedule,
      date: row.date,
      startTime: content.startTime,
      endTime: content.endTime,
      seriesSlug: event.slug,
    });
    const hash = calendarEventHash(googleEvent);
    const stored = parseCalendarLink(row.googleCalendarEventId);
    try {
      if (stored.id && stored.hash === hash) {
        usedIds.add(stored.id);
        continue;
      }
      let eventId = stored.id;
      if (!eventId) {
        const choice = chooseCalendarEvent(
          listed.filter((item) => eventFallsOnDate(item, row.date)),
          {
            summary: googleEvent.summary,
            seriesName: event.name,
            occurrenceId: row.id,
            usedIds,
          },
        );
        if (choice.ambiguous) {
          noteCalendarWarning(
            env,
            `${row.date} already had several matching events, so a new one was added.`,
          );
        }
        if (choice.action === "adopt" && choice.event?.id) {
          eventId = choice.event.id;
        }
      }
      const savedId = await saveGoogleEvent(
        env,
        calendarId,
        googleEvent,
        eventId,
      );
      if (!savedId) {
        noteCalendarWarning(
          env,
          `Could not update ${row.date} on Google Calendar.`,
        );
        continue;
      }
      usedIds.add(savedId);
      if (
        linkField &&
        formatCalendarLink(savedId, hash) !== row.googleCalendarEventId
      ) {
        await writeCalendarLink(env, tableId, linkField, row.id, savedId, hash);
      }
    } catch (error) {
      noteCalendarWarning(
        env,
        `Could not update ${row.date} on Google Calendar. ${error?.message || "Request failed."}`,
      );
    }
  }

  return {
    event,
    warnings: Array.isArray(env?.__gwendaCalendarWarnings)
      ? [...env.__gwendaCalendarWarnings]
      : [],
  };
}
