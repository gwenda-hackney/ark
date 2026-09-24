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
import { stageEvent, unpublishOccurrences } from "../../../../_lib/event-publish.js";

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
  await syncSeriesCalendar(context.env, result.event);
  const staged = await stageEvent(context.env, id);
  return jsonResponse(
    attachCalendarWarnings(context.env, {
      ok: true,
      ...result,
      event: staged.event || result.event,
      staging: staged.staging,
    }),
    result.created ? 201 : 200,
  );
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
  await syncSeriesCalendar(context.env, result.event);
  const ownerId = String(result.event?.id || id);
  if (targetSeriesId && ownerId !== String(id)) await stageEvent(context.env, id);
  const staged = await stageEvent(context.env, ownerId);
  return jsonResponse(
    attachCalendarWarnings(context.env, {
      ok: true,
      ...result,
      event: staged.event || result.event,
      staging: staged.staging,
    }),
  );
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
  const warnings = await unpublishOccurrences(context.env, plan.targets);
  const result = await deleteOccurrences(context.env, id, date, scope);
  if (result.event) await syncSeriesCalendar(context.env, result.event);
  return jsonResponse(
    attachCalendarWarnings(context.env, { ok: true, warnings, ...result }),
  );
});
