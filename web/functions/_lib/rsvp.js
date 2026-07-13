import { baserowRsvpRowsUrl } from "./baserow.js";
import { fetchEventBySlug } from "./sanity-event.js";

const TOKEN_RE = /^[a-f0-9]{32}$/i;
const EVENT_SLUG_FIELD = "Event Slug";

export function isValidInviteToken(token) {
  return typeof token === "string" && TOKEN_RE.test(token.trim());
}

function normalizeToken(token) {
  return token.trim().toLowerCase();
}

export async function getInviteByToken(env, token) {
  const normalized = normalizeToken(token);
  if (!isValidInviteToken(normalized)) {
    return { ok: false, status: 400, error: "Invalid invite link." };
  }

  const config = await baserowRsvpRowsUrl(env);
  if (!config.ok) {
    return { ok: false, status: 502, error: "Something went wrong. Try again?" };
  }

  const filterUrl =
    `${config.rowsUrl}&filter__Token__equal=${encodeURIComponent(normalized)}`;
  const upstream = await fetch(filterUrl, {
    headers: { Authorization: `Token ${config.apiKey}` },
  });

  if (!upstream.ok) {
    return { ok: false, status: 502, error: "Something went wrong. Try again?" };
  }

  const payload = await upstream.json();
  const row = payload?.results?.[0];
  if (!row) {
    return { ok: false, status: 404, error: "This invite link is not valid." };
  }

  const guests = row["RSVP Guests"];
  const eventSlug = row[EVENT_SLUG_FIELD]?.trim() || null;
  const event = eventSlug ? await fetchEventBySlug(env, eventSlug) : null;

  return {
    ok: true,
    status: 200,
    guest: {
      name: row.Name ?? "",
      rsvpGuests: typeof guests === "number" ? guests : null,
      eventSlug,
    },
    event,
  };
}

export async function saveRsvpGuests(env, token, guestCount) {
  const normalized = normalizeToken(token);
  if (!isValidInviteToken(normalized)) {
    return { ok: false, status: 400, error: "Invalid invite link." };
  }

  if (!Number.isInteger(guestCount) || guestCount < 0 || guestCount > 20) {
    return { ok: false, status: 400, error: "Enter a number between 0 and 20." };
  }

  const config = await baserowRsvpRowsUrl(env);
  if (!config.ok) {
    return { ok: false, status: 502, error: "Something went wrong. Try again?" };
  }

  const filterUrl =
    `${config.rowsUrl}&filter__Token__equal=${encodeURIComponent(normalized)}`;
  const lookup = await fetch(filterUrl, {
    headers: { Authorization: `Token ${config.apiKey}` },
  });

  if (!lookup.ok) {
    return { ok: false, status: 502, error: "Something went wrong. Try again?" };
  }

  const payload = await lookup.json();
  const row = payload?.results?.[0];
  if (!row?.id) {
    return { ok: false, status: 404, error: "This invite link is not valid." };
  }

  const patch = await fetch(config.rowUrl(row.id), {
    method: "PATCH",
    headers: {
      Authorization: `Token ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      "RSVP Guests": guestCount,
      "RSVP Updated": new Date().toISOString().slice(0, 10),
    }),
  });

  if (!patch.ok) {
    return { ok: false, status: 502, error: "Something went wrong. Try again?" };
  }

  return {
    ok: true,
    status: 200,
    guest: {
      name: row.Name ?? "",
      rsvpGuests: guestCount,
      eventSlug: row[EVENT_SLUG_FIELD]?.trim() || null,
    },
    event: row[EVENT_SLUG_FIELD]
      ? await fetchEventBySlug(env, row[EVENT_SLUG_FIELD].trim())
      : null,
  };
}
