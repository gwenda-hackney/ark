import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import {
  attachCalendarWarnings,
  syncSeriesCalendar,
} from "../../../src/events/server/event-calendar-sync.js";
import { listEvents } from "../../../src/events/server/event-store.js";

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
