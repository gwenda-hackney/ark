import { jsonResponse, withApiHandler } from "../_lib/api-handler.js";
import { resolveTicket } from "../_lib/ticket.js";
import { publicEventFields } from "../_lib/sanity-event.js";

export const onRequestGet = withApiHandler(async (context) => {
  const params = new URL(context.request.url).searchParams;
  const result = await resolveTicket(context.env, {
    slug: params.get("slug"),
    guest: params.get("guest"),
    token: params.get("t"),
  });
  if (!result.ok) {
    return jsonResponse({ error: result.error }, result.status);
  }

  return jsonResponse({
    ok: true,
    event: publicEventFields(result.event),
    guest: { name: result.guest.name, guests: result.guest.rsvpGuests },
    ticketId: result.ticketId,
  });
});
