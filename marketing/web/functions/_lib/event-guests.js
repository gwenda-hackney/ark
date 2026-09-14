import { baserowRsvpRowsUrl } from "./baserow.js";
import { parseInviteChannel } from "./invite-lib.js";
import { generateInviteToken } from "./invite-tokens.js";
import { buildInviteUrl } from "./invite-url.js";
import { fetchEventBySlug } from "./sanity-event.js";

const EVENT_SLUG_FIELD = "Event Slug";

/** Baserow's REST API returns number field values as strings (e.g. "2"). */
function parseGuestCount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function rowToGuest(row) {
  const channel = parseInviteChannel(row.Channel);
  return {
    rowId: row.id,
    taskId: null,
    name: (row.Name ?? "").trim(),
    contact: row.Contact?.trim() || null,
    channel,
    token: row.Token?.trim() || null,
    rsvpGuests: parseGuestCount(row["RSVP Guests"]),
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

export async function ensureGuestToken(env, guest, inviteBaseUrl, eventSlug, eventCode) {
  let rsvpCode = eventCode?.trim().toLowerCase() || null;
  if (!rsvpCode) {
    const event = await fetchEventBySlug(env, eventSlug);
    rsvpCode = event?.rsvpCode?.trim().toLowerCase() || null;
  }
  if (!rsvpCode) {
    throw new Error(`Event "${eventSlug}" has no RSVP code. Add one in Sanity.`);
  }

  if (guest.token) {
    return {
      token: guest.token,
      inviteUrl: buildInviteUrl(inviteBaseUrl, rsvpCode, guest.token),
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

  return { token, inviteUrl: buildInviteUrl(inviteBaseUrl, rsvpCode, token) };
}

/** Look up a guest by Baserow row id, scoped to an event slug (for ticket links). */
export async function getGuestByIdForEvent(env, eventSlug, rowId) {
  const slug = eventSlug?.trim();
  if (!slug || !Number.isInteger(rowId) || rowId <= 0) {
    return { ok: false, status: 400, error: "Event and guest are required." };
  }

  const config = await baserowRsvpRowsUrl(env);
  if (!config.ok) {
    return { ok: false, status: 502, error: "Could not reach guest registry." };
  }

  const upstream = await fetch(config.rowUrl(rowId), {
    headers: { Authorization: `Token ${config.apiKey}` },
  });
  if (upstream.status === 404) {
    return { ok: true, status: 200, guest: null };
  }
  if (!upstream.ok) {
    return { ok: false, status: 502, error: "Could not load guest." };
  }

  const row = await upstream.json();
  if ((row[EVENT_SLUG_FIELD] ?? "").trim() !== slug) {
    return { ok: true, status: 200, guest: null };
  }

  return { ok: true, status: 200, guest: rowToGuest(row) };
}

export async function findGuestByEventAndContact(env, eventSlug, contact) {
  const slug = eventSlug?.trim();
  const normalizedContact = contact?.trim();
  if (!slug || !normalizedContact) {
    return { ok: false, status: 400, error: "Event and contact are required." };
  }

  const config = await baserowRsvpRowsUrl(env);
  if (!config.ok) {
    return { ok: false, status: 502, error: "Could not reach guest registry." };
  }

  const filterUrl =
    `${config.rowsUrl}&filter__${encodeURIComponent(EVENT_SLUG_FIELD)}__equal=` +
    `${encodeURIComponent(slug)}&filter__Contact__equal=${encodeURIComponent(normalizedContact)}`;
  const upstream = await fetch(filterUrl, {
    headers: { Authorization: `Token ${config.apiKey}` },
  });

  if (!upstream.ok) {
    return { ok: false, status: 502, error: "Could not load guest." };
  }

  const payload = await upstream.json();
  const row = payload?.results?.[0];
  if (!row) {
    return { ok: true, status: 200, guest: null };
  }

  return { ok: true, status: 200, guest: rowToGuest(row) };
}

export async function createGuestForEvent(env, eventSlug, { name, email, source }) {
  const slug = eventSlug?.trim();
  const contact = email?.trim();
  const guestName = name?.trim() || contact?.split("@")[0] || "Guest";
  if (!slug || !contact) {
    return { ok: false, status: 400, error: "Event and email are required." };
  }

  const config = await baserowRsvpRowsUrl(env);
  if (!config.ok) {
    return { ok: false, status: 502, error: "Could not reach guest registry." };
  }

  const create = await fetch(config.rowsUrl, {
    method: "POST",
    headers: {
      Authorization: `Token ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Name: guestName,
      Channel: "Email",
      Contact: contact,
      [EVENT_SLUG_FIELD]: slug,
      ...(source ? { Source: source } : {}),
    }),
  });

  if (!create.ok) {
    return { ok: false, status: 502, error: "Could not register your RSVP." };
  }

  const row = await create.json();
  return { ok: true, status: 200, guest: rowToGuest(row) };
}
