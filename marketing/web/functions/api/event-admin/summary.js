import {
  eventAdminUnauthorized,
  verifyEventAdminRequest,
} from "../../_lib/event-admin-auth.js";
import { fetchGuestsForEvent, summarizeGuests } from "../../_lib/event-guests.js";
import { fetchEventBySlug } from "../../_lib/sanity-event.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestGet(context) {
  if (!verifyEventAdminRequest(context.request, context.env)) {
    return eventAdminUnauthorized();
  }

  const slug = new URL(context.request.url).searchParams.get("slug");
  if (!slug) return json({ error: "Missing slug." }, 400);

  const [event, guestsResult] = await Promise.all([
    fetchEventBySlug(context.env, slug),
    fetchGuestsForEvent(context.env, slug),
  ]);

  if (!guestsResult.ok) return json({ error: guestsResult.error }, guestsResult.status);

  return json({
    ok: true,
    slug,
    event,
    summary: summarizeGuests(guestsResult.guests),
  });
}
