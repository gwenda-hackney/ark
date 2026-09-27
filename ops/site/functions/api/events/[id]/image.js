import { jsonResponse, withApiHandler } from "../../../../src/platform/http.js";
import { clearEventImage, setEventImage } from "../../../../src/features/events/server/event-store.js";

const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function eventId(context) {
  return decodeURIComponent(context.params?.id || "");
}

export const onRequestPost = withApiHandler(async (context) => {
  const id = eventId(context);
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const form = await context.request.formData();
  const role = String(form.get("role") || "main").trim() === "gallery" ? "gallery" : "main";
  const file = form.get("file");
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
    return jsonResponse({ error: "Image file is required." }, 400);
  }
  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.has(contentType)) {
    return jsonResponse({ error: "Use a JPEG, PNG, WebP, or GIF image." }, 400);
  }
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) {
    return jsonResponse({ error: "Image must be 6MB or smaller." }, 400);
  }
  const event = await setEventImage(context.env, id, bytes, {
    filename: file.name || "event.jpg",
    contentType,
    role,
  });
  return jsonResponse({ ok: true, event });
});

export const onRequestDelete = withApiHandler(async (context) => {
  const id = eventId(context);
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const url = new URL(context.request.url);
  const role = url.searchParams.get("role") === "gallery" ? "gallery" : "main";
  const name = String(url.searchParams.get("name") || "");
  const event = await clearEventImage(context.env, id, { role, name });
  return jsonResponse({ ok: true, event });
});
