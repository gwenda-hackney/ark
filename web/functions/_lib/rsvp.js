import { baserowRsvpRowsUrl } from "./baserow.js";
import {
  createGuestForEvent,
  findGuestByEventAndContact,
} from "./event-guests.js";
import { isValidEmail } from "./invite-lib.js";
import { sendRsvpConfirmationEmail } from "./rsvp-email.js";
import { fetchEventBySlug, publicEventFields } from "./sanity-event.js";

const EVENT_SLUG_FIELD = "Event Slug";
const SOURCE_FIELD = "Source";
const INVALID_LINK = "This invitation link isn't valid or has expired.";

// Short lowercase alphanumeric access code. Kept permissive so older 32-char
// links keep working; the real gate is the exact match in findChannel().
const CHANNEL_TOKEN_RE = /^[a-z0-9]{6,40}$/i;

export function isValidChannelToken(token) {
  return typeof token === "string" && CHANNEL_TOKEN_RE.test(token.trim());
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Find the channel a token belongs to on an event, or null. */
export function findChannel(event, token) {
  const normalized = token?.trim().toLowerCase();
  if (!normalized || !Array.isArray(event?.channels)) return null;
  return event.channels.find((channel) => channel.token === normalized) || null;
}

/**
 * Resolve an event by slug and gate it behind a valid channel token.
 * Returns the event plus the channel label (attribution source).
 */
export async function getEventRsvp(env, slug, token) {
  const eventSlug = slug?.trim();
  if (!eventSlug) {
    return { ok: false, status: 404, error: INVALID_LINK };
  }

  const event = await fetchEventBySlug(env, eventSlug);
  if (!event?.slug) {
    return { ok: false, status: 404, error: INVALID_LINK };
  }

  const channel = findChannel(event, token);
  if (!channel) {
    return { ok: false, status: 403, error: INVALID_LINK };
  }

  return {
    ok: true,
    status: 200,
    event: publicEventFields(event),
    source: channel.label || "",
  };
}

/**
 * Save a public RSVP for an event, gated by a channel token. The channel
 * label is recorded as the attribution source. Attending guests are matched
 * or created by email; declines are recorded as an anonymous zero-guest row.
 */
function inviteUrlFor(origin, env, slug, token) {
  const base = (origin || env.INVITE_BASE_URL || "https://gwenda.co.uk").replace(
    /\/$/,
    "",
  );
  return `${base}/events/${slug}?key=${token}`;
}

export async function saveRsvpResponse(
  env,
  { slug, token, attending, name, email, guests, origin },
) {
  const eventSlug = slug?.trim();
  if (!eventSlug) {
    return { ok: false, status: 404, error: INVALID_LINK };
  }

  const event = await fetchEventBySlug(env, eventSlug);
  if (!event?.slug) {
    return { ok: false, status: 404, error: INVALID_LINK };
  }

  const channel = findChannel(event, token);
  if (!channel) {
    return { ok: false, status: 403, error: INVALID_LINK };
  }
  const source = channel.label || "";

  const config = await baserowRsvpRowsUrl(env);
  if (!config.ok) {
    return { ok: false, status: 502, error: "Something went wrong. Try again?" };
  }

  if (!attending) {
    const create = await fetch(config.rowsUrl, {
      method: "POST",
      headers: {
        Authorization: `Token ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        [EVENT_SLUG_FIELD]: event.slug,
        [SOURCE_FIELD]: source,
        "RSVP Guests": 0,
        "RSVP Updated": today(),
      }),
    });
    if (!create.ok) {
      return { ok: false, status: 502, error: "Something went wrong. Try again?" };
    }
    return {
      ok: true,
      status: 200,
      attending: false,
      rsvpGuests: 0,
      source,
      event: publicEventFields(event),
    };
  }

  const contact = email?.trim().toLowerCase();
  const cleanName = name?.trim();
  if (!cleanName) {
    return { ok: false, status: 400, error: "Please add your name." };
  }
  if (!isValidEmail(contact)) {
    return { ok: false, status: 400, error: "Please add a valid email." };
  }
  const count = Number.parseInt(String(guests), 10);
  if (!Number.isInteger(count) || count < 1 || count > 20) {
    return { ok: false, status: 400, error: "How many of you are coming?" };
  }

  const existing = await findGuestByEventAndContact(env, event.slug, contact);
  if (!existing.ok) return existing;

  let guest = existing.guest;
  if (!guest) {
    const created = await createGuestForEvent(env, event.slug, {
      name: cleanName,
      email: contact,
      source,
    });
    if (!created.ok) return created;
    guest = created.guest;
  }

  const patch = await fetch(config.rowUrl(guest.rowId), {
    method: "PATCH",
    headers: {
      Authorization: `Token ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Name: cleanName,
      [SOURCE_FIELD]: source,
      "RSVP Guests": count,
      "RSVP Updated": today(),
    }),
  });
  if (!patch.ok) {
    return { ok: false, status: 502, error: "Something went wrong. Try again?" };
  }

  // Best-effort confirmation email. A mail failure must not fail the RSVP,
  // which is already saved at this point.
  try {
    await sendRsvpConfirmationEmail(env, {
      to: contact,
      name: cleanName,
      guests: count,
      event,
      inviteUrl: inviteUrlFor(origin, env, event.slug, token),
      origin,
      ticketId: `${event.slug}-${guest.rowId}`,
    });
  } catch (error) {
    console.warn(
      `RSVP confirmation email failed for ${contact}:`,
      error instanceof Error ? error.message : error,
    );
  }

  return {
    ok: true,
    status: 200,
    attending: true,
    name: cleanName,
    rsvpGuests: count,
    source,
    event: publicEventFields(event),
  };
}
