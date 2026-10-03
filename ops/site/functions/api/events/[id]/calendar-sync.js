import { jsonResponse, withApiHandler } from "../../../../src/platform/http.js";
import {
  attachCalendarWarnings,
  configuredCalendarId,
  syncSeriesCalendar,
} from "../../../../src/events/server/event-calendar-sync.js";
import { getEvent } from "../../../../src/events/server/event-store.js";

/** Push one saved series onto Google Calendar. Does not write the site. */
export const onRequestPost = withApiHandler(async (context) => {
  const id = decodeURIComponent(context.params?.id || "");
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const event = await getEvent(context.env, id);
  const calendarId = await configuredCalendarId(context.env);
  if (!calendarId) {
    return jsonResponse({
      ok: true,
      event,
      warnings: ["Google Calendar is not configured."],
    });
  }
  await syncSeriesCalendar(context.env, event, { verify: true });
  const fresh = await getEvent(context.env, id);
  return jsonResponse(
    attachCalendarWarnings(context.env, { ok: true, event: fresh }),
  );
});
