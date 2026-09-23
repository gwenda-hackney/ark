import { buildWhatsOnHome } from "../_lib/event-series.js";
import { fetchPublishedCatalog } from "../_lib/sanity-events.js";
import { jsonResponse, withApiHandler } from "../_lib/api-handler.js";

export const onRequestGet = withApiHandler(async (context) => {
  const url = new URL(context.request.url);
  const { occurrences, series: seriesRecords } = await fetchPublishedCatalog(
    context.env,
  );
  const { series, nights, next } = buildWhatsOnHome(occurrences, {
    after: url.searchParams.get("after") || "",
    afterId: url.searchParams.get("afterId") || "",
    limit: url.searchParams.get("limit") || "",
    series: seriesRecords,
  });
  return jsonResponse({ ok: true, series, nights, next }, 200, {
    "Cache-Control": "public, max-age=60",
  });
});
