import { baserowRsvpRowsUrl } from "./baserow.js";
import { parseInviteChannel } from "./invite-lib.js";
import { generateInviteToken } from "./invite-tokens.js";
import { buildInviteUrl } from "./invite-url.js";

const EVENT_SLUG_FIELD = "Event Slug";

function rowToGuest(row) {
  const channel = parseInviteChannel(row.Channel);
  const rsvp = row["RSVP Guests"];
  return {
    rowId: row.id,
    name: (row.Name ?? "").trim(),
    contact: row.Contact?.trim() || null,
    channel,
    token: row.Token?.trim() || null,
    rsvpGuests: typeof rsvp === "number" ? rsvp : null,
    rsvpUpdated: row["RSVP Updated"] ?? null,
  };
}

export async function fetchGuestsForEvent(env, eventSlug) {
  const slug = eventSlug?.trim();
  if (!slug) return { ok: false, status: 400, error: "Event slug is required." };

  const config = await baserowRsvpRowsUrl(env);
  if (!config.ok) {
    return { ok: false, status: 502, error: "Could not reach guest registry." };
  }

  const filterUrl =
    `${config.rowsUrl}&filter__${encodeURIComponent(EVENT_SLUG_FIELD)}__equal=` +
    `${encodeURIComponent(slug)}`;
  const upstream = await fetch(filterUrl, {
    headers: { Authorization: `Token ${config.apiKey}` },
  });

  if (!upstream.ok) {
    return { ok: false, status: 502, error: "Could not load guests." };
  }

  const payload = await upstream.json();
  const guests = (payload?.results ?? []).map(rowToGuest);
  return { ok: true, status: 200, guests };
}

export function summarizeGuests(guests) {
  let invited = 0;
  let responded = 0;
  let totalAttending = 0;
  let pendingSend = 0;

  for (const guest of guests) {
    if (!guest.name) continue;
    invited += 1;
    if (guest.token) {
      if (guest.rsvpGuests != null) {
        responded += 1;
        totalAttending += guest.rsvpGuests;
      }
    } else if (guest.channel && guest.contact) {
      pendingSend += 1;
    }
  }

  return {
    invited,
    responded,
    totalAttending,
    pendingSend,
    notResponded: invited - responded,
  };
}

export async function ensureGuestToken(env, guest, inviteBaseUrl, eventSlug) {
  if (guest.token) {
    return {
      token: guest.token,
      inviteUrl: buildInviteUrl(inviteBaseUrl, guest.token),
    };
  }

  const config = await baserowRsvpRowsUrl(env);
  if (!config.ok) {
    throw new Error("Baserow is not configured.");
  }

  const token = generateInviteToken();
  const patch = await fetch(config.rowUrl(guest.rowId), {
    method: "PATCH",
    headers: {
      Authorization: `Token ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Token: token,
      "Event Slug": eventSlug,
      ...(guest.name ? { Name: guest.name } : {}),
      ...(guest.channel ? { Channel: guest.channel } : {}),
      ...(guest.contact ? { Contact: guest.contact } : {}),
    }),
  });

  if (!patch.ok) {
    throw new Error(`Could not register invite link (${patch.status}).`);
  }

  return { token, inviteUrl: buildInviteUrl(inviteBaseUrl, token) };
}
