import { parseInviteChannel } from "./lib.js";
import type { Guest } from "./types.js";
import { DEFAULT_BASEROW_API, resolveRsvpTableId } from "./baserow-table.js";

const EVENT_SLUG_FIELD = "Event Slug";

export class BaserowGuestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "BaserowGuestError";
  }
}

type BaserowConfig = {
  apiKey: string;
  tableId: string;
  apiBase: string;
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

type BaserowRow = {
  id: number;
  Name?: string;
  Channel?: string;
  Contact?: string;
  Token?: string;
  "RSVP Guests"?: number;
  "RSVP Updated"?: string;
};

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

export async function fetchGuestsFromBaserow(
  env: NodeJS.ProcessEnv,
  eventSlug: string,
): Promise<Guest[]> {
  const config = await readBaserowConfig(env);
  const rowsUrl = `/api/database/rows/table/${config.tableId}/?user_field_names=true`;
  const filterUrl =
    `${rowsUrl}&filter__${encodeURIComponent(EVENT_SLUG_FIELD)}__equal=` +
    `${encodeURIComponent(eventSlug)}`;

  const response = await fetch(`${config.apiBase}${filterUrl}`, {
    headers: { Authorization: `Token ${config.apiKey}` },
  });

  if (!response.ok) {
    throw new BaserowGuestError(
      "Baserow guest list fetch failed",
      response.status,
      (await response.text()).slice(0, 300),
    );
  }

  const payload = (await response.json()) as { results?: BaserowRow[] };
  return (payload.results ?? []).map(rowToGuest);
}
