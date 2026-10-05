import { jsonResponse, withApiHandler } from "../../../../../src/platform/http.js";
import { removeGalleryImage } from "../../../../../src/events/server/event-store.js";

/** Take a photo off the gallery: it leaves the website on Update website. */
export const onRequestDelete = withApiHandler(async (context) => {
  const id = decodeURIComponent(context.params?.id || "");
  const key = decodeURIComponent(context.params?.key || "");
  if (!id || !key) return jsonResponse({ error: "Missing event id or photo." }, 400);
  const event = await removeGalleryImage(context.env, id, key);
  return jsonResponse({ ok: true, event });
});
