import { jsonResponse, withApiHandler } from "../../_lib/http.js";
import { setMenuItemPhoto } from "../../_lib/menu-store.js";

const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const onRequestPost = withApiHandler(async (context) => {
  const form = await context.request.formData();
  const itemId = String(form.get("itemId") || "").trim();
  const alt = String(form.get("alt") || "").trim();
  const file = form.get("file");

  if (!itemId) return jsonResponse({ error: "itemId is required." }, 400);
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

  const item = await setMenuItemPhoto(context.env, itemId, bytes, {
    filename: file.name || "cocktail.jpg",
    contentType,
    alt,
  });

  return jsonResponse({
    ok: true,
    url: item.image?.asset?.url,
    item,
  });
});
