import { baserowRsvpRowsUrl } from "./baserow.js";
import { parseInviteChannel } from "./invite-lib.js";

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

export async function createGuestForEvent(
  env,
  eventSlug,
  { name, email, source },
) {
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
