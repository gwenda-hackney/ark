import { jsonResponse, withApiHandler } from "../../../_lib/http.js";
import {
  attachCalendarWarnings,
  configuredCalendarId,
  syncSeriesCalendar,
} from "../../../_lib/event-calendar-sync.js";
import { getEvent } from "../../../_lib/event-store.js";

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
  await syncSeriesCalendar(context.env, event);
  const fresh = await getEvent(context.env, id);
  return jsonResponse(
    attachCalendarWarnings(context.env, { ok: true, event: fresh }),
  );
});
