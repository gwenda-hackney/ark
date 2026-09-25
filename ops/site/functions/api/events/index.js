import { jsonResponse, readJsonBody, withApiHandler } from "../../_lib/http.js";
import { attachCalendarWarnings, syncSeriesCalendar } from "../../_lib/event-calendar-sync.js";
import { createEvent, listEvents } from "../../_lib/event-store.js";
import { stageEvent, withWebsiteStatus } from "../../_lib/event-publish.js";

export const onRequestGet = withApiHandler(async (context) => {
  const events = await withWebsiteStatus(context.env, await listEvents(context.env));
  return jsonResponse({ events });
});

export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  const created = await createEvent(context.env, body);
  await syncSeriesCalendar(context.env, created);
  const { event, staging } = await stageEvent(context.env, created.id);
  return jsonResponse(
    attachCalendarWarnings(context.env, { ok: true, event: event || created, staging }),
    201,
  );
});
