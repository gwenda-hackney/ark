import { jsonResponse, readJsonBody, withApiHandler } from "../../../_lib/http.js";
import { attachCalendarWarnings } from "../../../_lib/event-calendar-sync.js";
import { publishEventLive, publishEventPreview } from "../../../_lib/event-publish.js";

export const onRequestPost = withApiHandler(async (context) => {
  const id = decodeURIComponent(context.params?.id || "");
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const body = await readJsonBody(context.request);
  const target = body?.target === "production" ? "production" : "staging";
  const result =
    target === "production"
      ? await publishEventLive(context.env, id)
      : await publishEventPreview(context.env, id);
  return jsonResponse(
    attachCalendarWarnings(context.env, { ok: true, ...result }),
    result.deployed ? 202 : 200,
  );
});
