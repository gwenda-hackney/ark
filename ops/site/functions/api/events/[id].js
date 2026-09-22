import { jsonResponse, readJsonBody, withApiHandler } from "../../_lib/http.js";
import { deleteEvent, getEvent, updateEvent } from "../../_lib/event-store.js";
import { unpublishEvent } from "../../_lib/event-publish.js";

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
  const event = await updateEvent(context.env, id, body);
  return jsonResponse({ ok: true, event });
});

export const onRequestDelete = withApiHandler(async (context) => {
  const id = eventId(context);
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const event = await getEvent(context.env, id);
  const warnings = await unpublishEvent(context.env, event);
  await deleteEvent(context.env, id);
  return jsonResponse({ ok: true, id, warnings });
});
