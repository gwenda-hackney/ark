import { jsonResponse, readJsonBody, withApiHandler } from "../../../_lib/http.js";
import { attachCalendarWarnings } from "../../../_lib/event-calendar-sync.js";
import {
  previewEventOnWebsite,
  publishEventPreview,
  putEventOnWebsite,
  withWebsiteStatus,
} from "../../../_lib/event-publish.js";
import { assertNotLocal } from "../../../_lib/sanity.js";

function eventId(context) {
  return decodeURIComponent(context.params?.id || "");
}

/** What "Put on website" would change for this event. Read-only. */
export const onRequestGet = withApiHandler(async (context) => {
  const id = eventId(context);
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const preview = await previewEventOnWebsite(context.env, id);
  return jsonResponse({ ok: true, ...preview });
});

/**
 * `{ target: "production", confirm: "production" }` puts this event on the
 * website (staging first, then only its documents live). Otherwise re-stages.
 */
export const onRequestPost = withApiHandler(async (context) => {
  const id = eventId(context);
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const body = await readJsonBody(context.request).catch(() => null);
  if (body?.target === "production") {
    assertNotLocal(context.env, "Local ops cannot put events on the website.");
    if (body.confirm !== "production") {
      return jsonResponse({ error: 'Send confirm: "production".' }, 400);
    }
    const result = await putEventOnWebsite(context.env, id);
    return jsonResponse(attachCalendarWarnings(context.env, { ok: true, ...result }));
  }
  const result = await publishEventPreview(context.env, id);
  const event = await withWebsiteStatus(context.env, result.event);
  return jsonResponse(attachCalendarWarnings(context.env, { ok: true, ...result, event }));
});
