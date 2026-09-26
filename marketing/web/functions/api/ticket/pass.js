import { jsonResponse, withApiHandler } from "../../_lib/api-handler.js";
import { resolveTicket } from "../../_lib/ticket.js";
import {
  buildAppleWalletPass,
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
  const pass = await buildAppleWalletPass(context.env, {
    ticketId,
    title: event.title,
    date: event.date,
    startTime: event.ticketStart,
    endTime: event.ticketEnd,
    venue: event.venue,
    guestName: guest.name,
    guests: guest.rsvpGuests,
    heroImageUrl: event.heroImageUrl,
  });

  if (!pass) {
    return jsonResponse(
      { error: "Apple Wallet isn't set up for this event yet." },
      503,
    );
  }

  return new Response(pass, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="${ticketAttachmentBaseName(event.slug)}.pkpass"`,
      "Cache-Control": "no-store",
    },
  });
});
