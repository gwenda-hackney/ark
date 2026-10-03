import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { createEvent, listEvents } from "../../../src/events/server/event-store.js";
import { eventDocumentIds, withWebsiteStatus } from "../../../src/events/server/event-publish.js";

export const onRequestGet = withApiHandler(async (context) => {
  // `?deleted=1`: events deleted in ops that are still on the website (#23),
  // with their documents, for the Website page's Take off / Restore.
  if (new URL(context.request.url).searchParams.get("deleted")) {
    const all = await listEvents(context.env, { withDeleted: true });
    const deleted = await Promise.all(
      all
        .filter((event) => event.deletedAt)
        .map(async (event) => ({ ...event, documentIds: await eventDocumentIds(context.env, event) })),
    );
    return jsonResponse({ events: deleted });
  }
  const events = await withWebsiteStatus(context.env, await listEvents(context.env));
  return jsonResponse({ events });
});

export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  // Saving only writes Baserow. Calendar and website copy follow in the
  // background (website-jobs.js), so the save returns quickly.
  const event = await createEvent(context.env, body);
  return jsonResponse({ ok: true, event }, 201);
});
