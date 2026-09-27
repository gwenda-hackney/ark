import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { deleteArtist, getArtist, updateArtist } from "../../../src/artists/server/artist-store.js";

function artistId(context) {
  return decodeURIComponent(context.params?.id || "");
}

export const onRequestGet = withApiHandler(async (context) => {
  const artist = await getArtist(context.env, artistId(context));
  return jsonResponse({ artist });
});

export const onRequestPatch = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  const artist = await updateArtist(context.env, artistId(context), body);
  return jsonResponse({ ok: true, artist });
});

export const onRequestDelete = withApiHandler(async (context) => {
  const result = await deleteArtist(context.env, artistId(context));
  return jsonResponse(result);
});
