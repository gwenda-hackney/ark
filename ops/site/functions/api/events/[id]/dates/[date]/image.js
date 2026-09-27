import { jsonResponse, withApiHandler } from "../../../../../../src/platform/http.js";
import {
  clearOccurrenceImage,
  setOccurrenceImage,
} from "../../../../../../src/features/events/server/event-store.js";

const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function params(context) {
  return {
    id: decodeURIComponent(context.params?.id || ""),
    date: decodeURIComponent(context.params?.date || ""),
  };
}

export const onRequestPost = withApiHandler(async (context) => {
  const { id, date } = params(context);
  if (!id || !date) {
    return jsonResponse({ error: "Missing event id or occurrence date." }, 400);
  }
  const form = await context.request.formData();
  const file = form.get("file");
  if (
    !file ||
    typeof file === "string" ||
    typeof file.arrayBuffer !== "function"
  ) {
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
  const result = await setOccurrenceImage(context.env, id, date, bytes, {
    filename: file.name || "event-guest.jpg",
    contentType,
  });
  return jsonResponse({ ok: true, ...result });
});

export const onRequestDelete = withApiHandler(async (context) => {
  const { id, date } = params(context);
  if (!id || !date) {
    return jsonResponse({ error: "Missing event id or occurrence date." }, 400);
  }
  const result = await clearOccurrenceImage(context.env, id, date);
  return jsonResponse({ ok: true, ...result });
});
