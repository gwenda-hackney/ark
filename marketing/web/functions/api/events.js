import { fetchPublishedEvents } from "../_lib/sanity-events.js";
import { pageEventFeed } from "../_lib/event-feed.js";
import { jsonResponse, withApiHandler } from "../_lib/api-handler.js";

export const onRequestGet = withApiHandler(async (context) => {
  const url = new URL(context.request.url);
  const events = await fetchPublishedEvents(context.env);
  const page = pageEventFeed(events, {
    after: url.searchParams.get("after") || "",
    afterId: url.searchParams.get("afterId") || "",
    limit: url.searchParams.get("limit") || "",
  });
  return jsonResponse({ ok: true, events: page.events, next: page.next }, 200, {
    "Cache-Control": "public, max-age=60",
  });
});
