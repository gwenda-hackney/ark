import { jsonResponse, withApiHandler } from "../../_lib/api-handler.js";
import { resolveTicket } from "../../_lib/ticket.js";
import {
  buildCalendarTicket,
  ticketAttachmentBaseName,
} from "../../_lib/rsvp-tickets.js";

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

  const { event, guest, ticketId } = result;
  const ics = buildCalendarTicket({
    ticketId,
    title: event.title,
    date: event.date,
    startTime: event.ticketStart,
    endTime: event.ticketEnd,
    venue: event.venue,
    guestName: guest.name,
    guests: guest.rsvpGuests,
    description: event.description,
  });

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ticketAttachmentBaseName(event.slug)}.ics"`,
      "Cache-Control": "no-store",
    },
  });
});
