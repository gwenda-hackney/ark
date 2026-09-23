import { jsonResponse, withApiHandler } from "../../_lib/http.js";
import {
  attachCalendarWarnings,
  syncSeriesCalendar,
} from "../../_lib/event-calendar-sync.js";
import { listEvents } from "../../_lib/event-store.js";

export const onRequestPost = withApiHandler(async (context) => {
  const events = await listEvents(context.env);
  let synced = 0;
  for (const event of events) {
    await syncSeriesCalendar(context.env, event);
    synced += 1;
  }
  return jsonResponse(
    attachCalendarWarnings(context.env, { ok: true, synced }),
  );
});
