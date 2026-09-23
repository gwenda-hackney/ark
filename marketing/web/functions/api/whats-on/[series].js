import { diaryCacheControl } from "../../_lib/event-feed.js";
import { buildSeriesDetail } from "../../_lib/event-series.js";
import { fetchPublishedCatalog } from "../../_lib/sanity-events.js";
import { jsonResponse, withApiHandler } from "../../_lib/api-handler.js";

export const onRequestGet = withApiHandler(async (context) => {
  const seriesId = decodeURIComponent(context.params?.series || "").trim();
  if (!seriesId) return jsonResponse({ error: "Missing series." }, 400);

  const url = new URL(context.request.url);
  const { occurrences, series: seriesRecords } = await fetchPublishedCatalog(
    context.env,
  );
  const detail = buildSeriesDetail(occurrences, seriesId, {
    after: url.searchParams.get("after") || "",
    afterId: url.searchParams.get("afterId") || "",
    limit: url.searchParams.get("limit") || "",
    series: seriesRecords,
  });
  if (!detail) return jsonResponse({ error: "Series not found." }, 404);

  return jsonResponse({ ok: true, series: detail }, 200, {
    "Cache-Control": diaryCacheControl(context.env),
  });
});
