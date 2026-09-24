import { jsonResponse, readJsonBody, withApiHandler } from "../../_lib/http.js";
import {
  attachCalendarWarnings,
  syncSeriesCalendar,
} from "../../_lib/event-calendar-sync.js";
import { deleteEvent, getEvent, updateEvent } from "../../_lib/event-store.js";
import { stageEvent, unpublishEvent } from "../../_lib/event-publish.js";

function eventId(context) {
  return decodeURIComponent(context.params?.id || "");
}

export const onRequestGet = withApiHandler(async (context) => {
  const id = eventId(context);
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const event = await getEvent(context.env, id);
  return jsonResponse({ event });
});

export const onRequestPatch = withApiHandler(async (context) => {
  const id = eventId(context);
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  const updated = await updateEvent(context.env, id, body);
  await syncSeriesCalendar(context.env, updated);
  const { event, staging } = await stageEvent(context.env, id);
  return jsonResponse(
    attachCalendarWarnings(context.env, { ok: true, event: event || updated, staging }),
  );
});

export const onRequestDelete = withApiHandler(async (context) => {
  const id = eventId(context);
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const event = await getEvent(context.env, id);
  const warnings = await unpublishEvent(context.env, event);
  await deleteEvent(context.env, id);
  return jsonResponse(
    attachCalendarWarnings(context.env, { ok: true, id, warnings }),
  );
});
