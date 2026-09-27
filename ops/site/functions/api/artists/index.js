import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { createArtist, listArtists } from "../../../src/features/artists/server/artist-store.js";

export const onRequestGet = withApiHandler(async (context) => {
  const artists = await listArtists(context.env);
  return jsonResponse({ artists });
});

export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  const artist = await createArtist(context.env, body);
  return jsonResponse({ ok: true, artist }, 201);
});
