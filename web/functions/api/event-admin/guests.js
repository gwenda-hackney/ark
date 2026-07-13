import {
  eventAdminUnauthorized,
  verifyEventAdminRequest,
} from "../../_lib/event-admin-auth.js";
import { fetchGuestsForEvent } from "../../_lib/event-guests.js";

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

  const result = await fetchGuestsForEvent(context.env, slug);
  if (!result.ok) return json({ error: result.error }, result.status);

  return json({ ok: true, slug, guests: result.guests });
}
