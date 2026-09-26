/**
 * Push ops nights onto the configured Google Calendar, and remove them
 * when the night row goes away. Calendar failures are warnings.
 */
import {
  baserowFetch,
  resolveOpsTableIds,
} from "./baserow.js";
import { OPS_CONFIG_KEYS, getConfigString, siteEnvName } from "./config-store.js";
import { resolveOccurrenceContent } from "./event-content.js";
import { expandSeriesOccurrenceDates, todayIso } from "./event-recurrence.js";
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
  if (siteEnvName(env) === "dev") {
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

/** Remember each night's calendar entry, in one Baserow batch call. */
async function writeCalendarLinks(env, tableId, fieldName, links) {
  for (let i = 0; i < links.length; i += 200) {
    await baserowFetch(
      env,
      `/api/database/rows/table/${tableId}/batch/?user_field_names=true`,
      {
        method: "PATCH",
        body: JSON.stringify({
          items: links.slice(i, i + 200).map(({ id, value }) => ({
            id: Number(id),
            [fieldName]: value,
            ...(fieldName === GOOGLE_CALENDAR_EVENT_FIELD
              ? { [CALENDAR_LINK_NOTES_FIELD]: "" }
              : {}),
          })),
        }),
      },
    );
  }
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

/** Upcoming nights the schedule still has (dropped ones wait to be removed). */
function scheduledFuture(event, today = todayIso()) {
  const scheduled = new Set(expandSeriesOccurrenceDates(event));
  return (event?.dates || []).filter(
    (row) => row?.date && row.date >= today && row.id && scheduled.has(row.date),
  );
}

function upcomingNights(event, today = todayIso()) {
  return scheduledFuture(event, today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, CALENDAR_SYNC_LIMIT);
}

function nightCalendarEvent(event, row) {
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
  return { googleEvent, hash: calendarEventHash(googleEvent) };
}

function nightIsCurrent(event, row) {
  const stored = parseCalendarLink(row.googleCalendarEventId);
  return Boolean(stored.id) && stored.hash === nightCalendarEvent(event, row).hash;
}

/** Upcoming nights whose Google Calendar entry is missing or out of date. */
export function calendarNightsBehind(event, today = todayIso()) {
  return upcomingNights(event, today).filter((row) => !nightIsCurrent(event, row)).length;
}

/** True when this ops has a Google Calendar to keep in step. */
export async function calendarConfigured(env) {
  const { calendarId, ready } = await calendarReady(env);
  return Boolean(calendarId && ready);
}

/**
 * Bring the series' upcoming nights onto Google Calendar. `maxWrites` caps
 * the calendar calls in one request (Cloudflare allows 50 on the free plan);
 * `remaining` says how many nights are still to do.
 */
export async function syncSeriesCalendar(env, event, { maxWrites = Infinity } = {}) {
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
  const future = scheduledFuture(event, today);
  const nights = upcomingNights(event, today);
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
  const links = [];
  let writes = 0;
  let remaining = 0;
  for (const row of nights) {
    const { googleEvent, hash } = nightCalendarEvent(event, row);
    const stored = parseCalendarLink(row.googleCalendarEventId);
    try {
      if (stored.id && stored.hash === hash) {
        usedIds.add(stored.id);
        continue;
      }
      if (writes >= maxWrites) {
        remaining += 1;
        continue;
      }
      writes += 1;
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
        links.push({ id: row.id, value: formatCalendarLink(savedId, hash) });
      }
    } catch (error) {
      noteCalendarWarning(
        env,
        `Could not update ${row.date} on Google Calendar. ${error?.message || "Request failed."}`,
      );
    }
  }

  if (links.length) {
    try {
      await writeCalendarLinks(env, tableId, linkField, links);
    } catch (error) {
      noteCalendarWarning(
        env,
        `Google Calendar was updated, but ops could not remember it. ${error?.message || "Request failed."}`,
      );
    }
  }

  return {
    event,
    remaining,
    warnings: Array.isArray(env?.__gwendaCalendarWarnings)
      ? [...env.__gwendaCalendarWarnings]
      : [],
  };
}
