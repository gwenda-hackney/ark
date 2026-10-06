import { jsonResponse, withApiHandler } from "../../../../src/platform/http.js";
import { clearArtistImage, setArtistImage } from "../../../../src/artists/server/artist-store.js";
import { readImageUpload } from "../../../../src/events/server/event-images.js";

function artistId(context) {
  return decodeURIComponent(context.params?.id || "");
}

export const onRequestPost = withApiHandler(async (context) => {
  const form = await context.request.formData();
  const kind = String(form.get("kind") || "").trim();
  const { bytes, filename, contentType } = await readImageUpload(form, "artist.jpg");
  const artist = await setArtistImage(context.env, artistId(context), bytes, {
    filename,
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
