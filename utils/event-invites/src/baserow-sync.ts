import type { Guest } from "./types.js";
import { DEFAULT_BASEROW_API, resolveRsvpTableId } from "./baserow-table.js";
import { BaserowGuestError } from "./baserow-guests.js";
import { parseInviteChannel } from "./lib.js";

const EVENT_SLUG_FIELD = "Event Slug";

type BaserowConfig = {
  apiKey: string;
  tableId: string;
  apiBase: string;
};

type BaserowRow = {
  id: number;
  Name?: string;
  Channel?: string;
  Contact?: string;
  Token?: string;
  "RSVP Guests"?: number;
};

async function readBaserowConfig(env: NodeJS.ProcessEnv): Promise<BaserowConfig> {
  const apiKey = env.BASEROW_API_KEY?.trim();
  const apiBase = (env.BASEROW_API_URL?.trim() || DEFAULT_BASEROW_API).replace(/\/$/, "");
  if (!apiKey) {
    throw new BaserowGuestError("BASEROW_API_KEY is required", 0, "");
  }

  const resolved = await resolveRsvpTableId(env);
  if (!resolved.ok) {
    throw new BaserowGuestError(resolved.error ?? "Baserow table not found", 0, "");
  }

  return { apiKey, tableId: resolved.tableId, apiBase };
}

async function baserowFetch(
  config: BaserowConfig,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${config.apiBase}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Token ${config.apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function rowToGuest(row: BaserowRow): Guest {
  const rsvp = row["RSVP Guests"];
  return {
    rowId: row.id,
    taskId: null,
    name: (row.Name ?? "").trim(),
    contact: row.Contact?.trim() || null,
    channel: parseInviteChannel(row.Channel),
    token: row.Token?.trim() || null,
    rsvpGuests: typeof rsvp === "number" ? rsvp : null,
    status: null,
  };
}

async function findRowByContact(
  config: BaserowConfig,
  eventSlug: string,
  contact: string,
): Promise<BaserowRow | null> {
  const rowsUrl = `/api/database/rows/table/${config.tableId}/?user_field_names=true`;
  const filterUrl =
    `${rowsUrl}&filter__${encodeURIComponent(EVENT_SLUG_FIELD)}__equal=` +
    `${encodeURIComponent(eventSlug)}&filter__Contact__equal=${encodeURIComponent(contact)}`;

  const response = await baserowFetch(config, filterUrl);
  if (!response.ok) return null;

  const payload = (await response.json()) as { results?: BaserowRow[] };
  return payload.results?.[0] ?? null;
}

async function createRow(
  config: BaserowConfig,
  eventSlug: string,
  guest: Guest,
): Promise<BaserowRow> {
  const response = await baserowFetch(
    config,
    `/api/database/rows/table/${config.tableId}/?user_field_names=true`,
    {
      method: "POST",
      body: JSON.stringify({
        Name: guest.name,
        Channel: guest.channel === "instagram" ? "Instagram" : "Email",
        Contact: guest.contact,
        [EVENT_SLUG_FIELD]: eventSlug,
      }),
    },
  );

  if (!response.ok) {
    throw new BaserowGuestError(
      "Baserow guest create failed",
      response.status,
      (await response.text()).slice(0, 300),
    );
  }

  return (await response.json()) as BaserowRow;
}

async function updateRow(
  config: BaserowConfig,
  rowId: number,
  eventSlug: string,
  guest: Guest,
): Promise<BaserowRow> {
  const response = await baserowFetch(
    config,
    `/api/database/rows/table/${config.tableId}/${rowId}/?user_field_names=true`,
    {
      method: "PATCH",
      body: JSON.stringify({
        Name: guest.name,
        Channel: guest.channel === "instagram" ? "Instagram" : "Email",
        Contact: guest.contact,
        [EVENT_SLUG_FIELD]: eventSlug,
      }),
    },
  );

  if (!response.ok) {
    throw new BaserowGuestError(
      "Baserow guest update failed",
      response.status,
      (await response.text()).slice(0, 300),
    );
  }

  return (await response.json()) as BaserowRow;
}

/** Upsert ClickUp guests into Baserow for RSVP tracking. */
export async function syncGuestsToBaserow(
  env: NodeJS.ProcessEnv,
  eventSlug: string,
  guests: Guest[],
): Promise<Guest[]> {
  const config = await readBaserowConfig(env);
  const synced: Guest[] = [];

  for (const guest of guests) {
    if (!guest.contact || !guest.channel) continue;

    const existing = await findRowByContact(config, eventSlug, guest.contact);
    const row = existing
      ? await updateRow(config, existing.id, eventSlug, guest)
      : await createRow(config, eventSlug, guest);

    synced.push({
      ...guest,
      ...rowToGuest(row),
      taskId: guest.taskId,
      status: guest.status,
    });
  }

  return synced;
}
