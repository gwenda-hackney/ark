import { diaryCacheControl } from "../_lib/event-feed.js";
import { jsonResponse, withApiHandler } from "../_lib/api-handler.js";
import { fetchFeaturedArtists } from "../../src/lib/featured-artist.js";

export const onRequestGet = withApiHandler(async (context) => {
  const featured = await fetchFeaturedArtists(context.env);
  const current = featured.current;
  return jsonResponse(
    {
      ok: true,
      artist: current
        ? {
            name: current.name,
            startMonth: current.startMonth || "",
            endMonth: current.endMonth || "",
          }
        : null,
    },
    200,
    { "Cache-Control": diaryCacheControl(context.env) },
  );
});
