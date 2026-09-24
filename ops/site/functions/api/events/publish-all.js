import { jsonResponse, withApiHandler } from "../../_lib/http.js";
import { publishAllEventPreviews } from "../../_lib/event-publish.js";

export const onRequestPost = withApiHandler(async (context) => {
  const result = await publishAllEventPreviews(context.env);
  return jsonResponse(
    { ok: result.failed.length === 0, ...result },
    result.deployed ? 202 : 200,
  );
});
