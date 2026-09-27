import {
  jsonResponse,
  readJsonBody,
  withApiHandler,
} from "../../../../_lib/http.js";
import {
  attachCalendarWarnings,
  syncSeriesCalendar,
} from "../../../../_lib/event-calendar-sync.js";
import {
  deleteOccurrences,
  ensureOccurrence,
  getEvent,
  occurrenceDeleteTargets,
  updateOccurrenceContent,
} from "../../../../_lib/event-store.js";
import { removeEventFromWebsite, unpublishOccurrences } from "../../../../_lib/event-publish.js";

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
  const event = await getEvent(context.env, id);
  const plan = occurrenceDeleteTargets(event, date, scope);
  // Deleting takes the nights off the preview and the website together.
  const warnings = await unpublishOccurrences(context.env, plan.targets);
  const result = await deleteOccurrences(context.env, id, date, scope);
  // Nothing left of the event (e.g. every night of a series not yet started):
  // its series page goes too, as when the whole event is deleted (#66).
  if (result.deleted) warnings.push(...(await removeEventFromWebsite(context.env, event)));
  if (result.event) await syncSeriesCalendar(context.env, result.event);
  return jsonResponse(
    attachCalendarWarnings(context.env, { ok: true, warnings, ...result }),
  );
});
