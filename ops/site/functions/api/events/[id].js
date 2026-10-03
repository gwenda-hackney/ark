import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import {
  attachCalendarWarnings,
} from "../../../src/events/server/event-calendar-sync.js";
import { getEvent, updateEvent } from "../../../src/events/server/event-store.js";
import {
  deleteEventFromOps,
  withWebsiteStatus,
} from "../../../src/events/server/event-publish.js";

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
  // Saving only writes Baserow. Calendar and website copy follow in the
  // background (website-jobs.js), so the save returns quickly.
  const event = await updateEvent(context.env, id, body);
  return jsonResponse({ ok: true, event });
});

export const onRequestDelete = withApiHandler(async (context) => {
  const id = eventId(context);
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  // Off the preview now; off the website on Update website (#23).
  const { pending, warnings } = await deleteEventFromOps(context.env, id);
  return jsonResponse(
    attachCalendarWarnings(context.env, { ok: true, id, pending, warnings }),
  );
});
