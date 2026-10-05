import { diaryCacheControl } from "../_lib/event-feed.js";
import { jsonResponse, withApiHandler } from "../_lib/api-handler.js";
import {
  fetchFeaturedArtists,
  liveArtist,
} from "../../src/lib/featured-artist.js";

export const onRequestGet = withApiHandler(async (context) => {
  const featured = await fetchFeaturedArtists(context.env, { strict: true });
  return jsonResponse({ ok: true, artist: liveArtist(featured.current) }, 200, {
    "Cache-Control": diaryCacheControl(context.env),
  });
});
