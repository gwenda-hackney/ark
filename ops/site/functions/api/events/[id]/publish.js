import { jsonResponse, readJsonBody, withApiHandler } from "../../../_lib/http.js";
import { attachCalendarWarnings } from "../../../_lib/event-calendar-sync.js";
import { publishEventPreview } from "../../../_lib/event-publish.js";

/** Re-stage one event. Saving already stages; this is the manual retry. */
export const onRequestPost = withApiHandler(async (context) => {
  const id = decodeURIComponent(context.params?.id || "");
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const body = await readJsonBody(context.request).catch(() => null);
  if (body?.target === "production") {
    return jsonResponse(
      { error: "Production only changes from Website > Release." },
      400,
    );
  }
  const result = await publishEventPreview(context.env, id);
  return jsonResponse(
    attachCalendarWarnings(context.env, { ok: true, ...result }),
    result.deployed ? 202 : 200,
  );
});
