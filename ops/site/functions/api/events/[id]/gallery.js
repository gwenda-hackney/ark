import { jsonResponse, withApiHandler } from "../../../../src/platform/http.js";
import { addGalleryImage } from "../../../../src/events/server/event-store.js";
import { readImageUpload } from "../../../../src/events/server/event-images.js";

/** Add a photo to the series' gallery; `?date=2026-10-02` to one night's (#183). */
export const onRequestPost = withApiHandler(async (context) => {
  const id = decodeURIComponent(context.params?.id || "");
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const date = new URL(context.request.url).searchParams.get("date") || "";
  const upload = await readImageUpload(await context.request.formData(), "photo.jpg");
  const event = await addGalleryImage(context.env, id, upload, { date });
  return jsonResponse({ ok: true, event });
});
