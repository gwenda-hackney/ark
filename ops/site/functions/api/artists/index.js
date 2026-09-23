import { jsonResponse, readJsonBody, withApiHandler } from "../../_lib/http.js";
import { createArtist, listArtists } from "../../_lib/artist-store.js";

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
