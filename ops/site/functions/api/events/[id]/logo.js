import { jsonResponse, withApiHandler } from "../../../../src/platform/http.js";
import { clearEventLogo, setEventLogo } from "../../../../src/events/server/event-store.js";
import { readImageUpload } from "../../../../src/platform/image-upload.js";

/** A pop-up kitchen's logo (#296): POST a file to add or replace it, DELETE to take it off. */
function eventId(context) {
  return decodeURIComponent(context.params?.id || "");
}

export const onRequestPost = withApiHandler(async (context) => {
  const id = eventId(context);
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const upload = await readImageUpload(await context.request.formData(), "logo.png");
  const event = await setEventLogo(context.env, id, upload);
  return jsonResponse({ ok: true, event });
});

export const onRequestDelete = withApiHandler(async (context) => {
  const id = eventId(context);
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const event = await clearEventLogo(context.env, id);
  return jsonResponse({ ok: true, event });
});
