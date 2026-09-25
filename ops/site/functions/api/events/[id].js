import { jsonResponse, readJsonBody, withApiHandler } from "../../_lib/http.js";
import {
  attachCalendarWarnings,
  syncSeriesCalendar,
} from "../../_lib/event-calendar-sync.js";
import { deleteEvent, getEvent, updateEvent } from "../../_lib/event-store.js";
import {
  removeEventFromWebsite,
  unpublishEvent,
  withWebsiteStatus,
} from "../../_lib/event-publish.js";
import { isLocalOps } from "../../_lib/sanity.js";

function eventId(context) {
  return decodeURIComponent(context.params?.id || "");
}

export const onRequestGet = withApiHandler(async (context) => {
  const id = eventId(context);
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const event = await withWebsiteStatus(context.env, await getEvent(context.env, id));
  return jsonResponse({ event });
});

export const onRequestPatch = withApiHandler(async (context) => {
  const id = eventId(context);
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  // Staging runs in its own request (the app calls /publish next): one request
  // doing both ran out of Cloudflare's 50 outbound calls on a long series.
  const event = await updateEvent(context.env, id, body);
  await syncSeriesCalendar(context.env, event);
  return jsonResponse(attachCalendarWarnings(context.env, { ok: true, event }));
});

export const onRequestDelete = withApiHandler(async (context) => {
  const id = eventId(context);
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const body = await readJsonBody(context.request).catch(() => null);
  const event = await getEvent(context.env, id);
  // "Also take it off the website now": otherwise it stays live until the
  // Website page publishes the removal.
  const offWebsite = Boolean(body?.alsoWebsite) && !isLocalOps(context.env);
  const warnings = offWebsite ? await removeEventFromWebsite(context.env, event) : [];
  warnings.push(...(await unpublishEvent(context.env, event)));
  await deleteEvent(context.env, id);
  return jsonResponse(
    attachCalendarWarnings(context.env, { ok: true, id, warnings }),
  );
});
