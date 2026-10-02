import { jsonResponse, withApiHandler } from "../../../../src/platform/http.js";
import { clearArtistImage, setArtistImage } from "../../../../src/artists/server/artist-store.js";

const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function artistId(context) {
  return decodeURIComponent(context.params?.id || "");
}

export const onRequestPost = withApiHandler(async (context) => {
  const form = await context.request.formData();
  const kind = String(form.get("kind") || "").trim();
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
  const artist = await setArtistImage(context.env, artistId(context), bytes, {
    filename: file.name || "artist.jpg",
    contentType,
    kind,
  });
  return jsonResponse({ ok: true, artist });
});

export const onRequestDelete = withApiHandler(async (context) => {
  const url = new URL(context.request.url);
  const artist = await clearArtistImage(context.env, artistId(context), {
    kind: url.searchParams.get("kind") || "",
    name: url.searchParams.get("name") || "",
  });
  return jsonResponse({ ok: true, artist });
});
