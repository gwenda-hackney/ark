import { jsonResponse, withApiHandler } from "../../../../src/platform/http.js";
import { restoreEvent, withWebsiteStatus } from "../../../../src/events/server/event-publish.js";

/** Undo deleting an event that is still on the website (#23). */
export const onRequestPost = withApiHandler(async (context) => {
  const id = decodeURIComponent(context.params?.id || "");
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const { event, warnings = [] } = await restoreEvent(context.env, id);
  return jsonResponse({ ok: true, event: await withWebsiteStatus(context.env, event), warnings });
});
