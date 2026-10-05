import { jsonResponse, withApiHandler } from "../../../../src/platform/http.js";
import { clearEventImage, setEventImage } from "../../../../src/events/server/event-store.js";
import { readImageUpload } from "../../../../src/events/server/event-images.js";

function eventId(context) {
  return decodeURIComponent(context.params?.id || "");
}

export const onRequestPost = withApiHandler(async (context) => {
  const id = eventId(context);
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const upload = await readImageUpload(await context.request.formData());
  const event = await setEventImage(context.env, id, upload);
  return jsonResponse({ ok: true, event });
});

export const onRequestDelete = withApiHandler(async (context) => {
  const id = eventId(context);
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const event = await clearEventImage(context.env, id);
  return jsonResponse({ ok: true, event });
});
