// Resolves a signed `/events/<slug>/ticket` link (see ticket-auth.js) to the
// event + guest it belongs to. Shared by the ticket details, Wallet pass, and
// calendar download API routes.

import { verifyTicketToken } from "./ticket-auth.js";
import { getGuestByIdForEvent } from "./event-guests.js";
import { fetchEventBySlug } from "./sanity-event.js";

const INVALID_TICKET = "This ticket link isn't valid.";

export async function resolveTicket(env, { slug, guest, token }) {
  const eventSlug = slug?.trim();
  const rowId = Number.parseInt(guest, 10);
  if (!eventSlug || !Number.isInteger(rowId) || rowId <= 0) {
    return { ok: false, status: 404, error: INVALID_TICKET };
  }

  const verified = await verifyTicketToken(env, eventSlug, rowId, token);
  if (!verified) {
    return { ok: false, status: 403, error: INVALID_TICKET };
  }

  const event = await fetchEventBySlug(env, eventSlug);
  if (!event?.slug) {
    return { ok: false, status: 404, error: INVALID_TICKET };
  }

  const guestResult = await getGuestByIdForEvent(env, eventSlug, rowId);
  if (!guestResult.ok) return guestResult;

  const guestRow = guestResult.guest;
  if (!guestRow?.name || !guestRow.rsvpGuests) {
    return { ok: false, status: 404, error: INVALID_TICKET };
  }

  return {
    ok: true,
    status: 200,
    event,
    guest: guestRow,
    ticketId: `${event.slug}-${rowId}`,
  };
}
