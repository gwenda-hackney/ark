import { jsonResponse, readJsonBody, withApiHandler } from "../../_lib/http.js";
import { attachCalendarWarnings, syncSeriesCalendar } from "../../_lib/event-calendar-sync.js";
import { createEvent, listEvents } from "../../_lib/event-store.js";

export const onRequestGet = withApiHandler(async (context) => {
  const events = await listEvents(context.env);
  return jsonResponse({ events });
});

export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  const event = await createEvent(context.env, body);
  await syncSeriesCalendar(context.env, event);
  return jsonResponse(attachCalendarWarnings(context.env, { ok: true, event }), 201);
});
