import { fetchPublishedEvents } from "../_lib/sanity-events.js";
import { jsonResponse, withApiHandler } from "../_lib/api-handler.js";

export const onRequestGet = withApiHandler(async (context) => {
  const events = await fetchPublishedEvents(context.env);
  return jsonResponse(
    { ok: true, events },
    200,
    { "Cache-Control": "public, max-age=60" },
  );
});
