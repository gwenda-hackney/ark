import {
  jsonResponse,
  readJsonBody,
  withApiHandler,
} from "../../../../../src/platform/http.js";
import {
  attachCalendarWarnings,
  syncSeriesCalendar,
} from "../../../../../src/events/server/event-calendar-sync.js";
import {
  deleteOccurrences,
  ensureOccurrence,
  getEvent,
  updateOccurrenceContent,
} from "../../../../../src/events/server/event-store.js";
import { deleteEventFromOps, unpublishOccurrences } from "../../../../../src/events/server/event-publish.js";

function params(context) {
  return {
    id: decodeURIComponent(context.params?.id || ""),
    date: decodeURIComponent(context.params?.date || ""),
  };
}

export const onRequestPut = withApiHandler(async (context) => {
  const { id, date } = params(context);
  if (!id || !date) {
    return jsonResponse({ error: "Missing event id or occurrence date." }, 400);
  }
  const body = await readJsonBody(context.request).catch(() => null);
  const result = await ensureOccurrence(
    context.env,
    id,
    date,
    body && typeof body === "object" ? body : {},
  );
  // Calendar and website copy follow in the background (website-jobs.js).
  return jsonResponse({ ok: true, ...result }, result.created ? 201 : 200);
});

export const onRequestPatch = withApiHandler(async (context) => {
  const { id, date } = params(context);
  if (!id || !date) {
    return jsonResponse({ error: "Missing event id or occurrence date." }, 400);
  }
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  const targetSeriesId = String(body.seriesId || body.targetEventId || "").trim();
  if (targetSeriesId && targetSeriesId !== String(id)) {
    const event = await getEvent(context.env, id);
    const occurrence = event.dates.find((row) => row.date === date);
    if (occurrence) {
      await unpublishOccurrences(context.env, [occurrence]);
    }
  }
  const result = await updateOccurrenceContent(context.env, id, date, body);
  // Calendar and website copy follow in the background (website-jobs.js).
  return jsonResponse({ ok: true, ...result });
});

export const onRequestDelete = withApiHandler(async (context) => {
  const { id, date } = params(context);
  if (!id || !date) {
    return jsonResponse({ error: "Missing event id or occurrence date." }, 400);
  }
  const url = new URL(context.request.url);
  const body = await readJsonBody(context.request).catch(() => null);
  const scope = String(
    body?.scope || url.searchParams.get("scope") || "this",
  ).trim();
  const warnings = [];
  let pending = false;
  // Deleting nights changes the schedule. The website job then treats them
  // like any night dropped from it: off the preview and the calendar now,
  // off the website on Update website (#23).
  const result = await deleteOccurrences(context.env, id, date, scope, {
    removeRow: async () => {},
    // Nothing left of the event: it goes the way a deleted event does (#66).
    removeEvent: async (env, eventId) => {
      const removed = await deleteEventFromOps(env, eventId);
      warnings.push(...removed.warnings);
      pending = removed.pending;
    },
  });
  if (result.event) await syncSeriesCalendar(context.env, result.event);
  return jsonResponse(
    attachCalendarWarnings(context.env, { ok: true, warnings, pending, ...result }),
  );
});
