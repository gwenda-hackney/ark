import { diaryCacheControl } from "../../_lib/event-feed.js";
import { buildPublicSchedule } from "../../_lib/event-series.js";
import { fetchPublishedCatalog } from "../../_lib/sanity-events.js";
import { jsonResponse, withApiHandler } from "../../_lib/api-handler.js";

export const onRequestGet = withApiHandler(async (context) => {
  const { occurrences, series: seriesRecords } = await fetchPublishedCatalog(
    context.env,
  );
  const { weeks } = buildPublicSchedule(occurrences, { series: seriesRecords });
  return jsonResponse({ ok: true, weeks }, 200, {
    "Cache-Control": diaryCacheControl(context.env),
  });
});
