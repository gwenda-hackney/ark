import { generateInviteToken } from "./tokens.js";
import type { Guest } from "./types.js";
import { DEFAULT_BASEROW_API, resolveRsvpTableId } from "./baserow-table.js";
import { fetchEventBySlug } from "./sanity-event.js";

export class BaserowError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "BaserowError";
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
    throw new BaserowError(
      "BASEROW_API_KEY is required to register invite links",
      0,
      "",
    );
  }

  const resolved = await resolveRsvpTableId(env);
  if (!resolved.ok) {
    throw new BaserowError(resolved.error ?? "Baserow table not found", 0, "");
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

export function buildInviteUrl(baseUrl: string, eventCode: string, token: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const code = eventCode.trim().toLowerCase();
  return `${base}/events/${code}/${token}`;
}

export async function ensureGuestInvite(
  env: NodeJS.ProcessEnv,
  guest: Guest,
  inviteBaseUrl: string,
  eventSlug: string,
): Promise<{ token: string; inviteUrl: string }> {
  const event = await fetchEventBySlug(env, eventSlug);
  const rsvpCode = event?.rsvpCode?.trim().toLowerCase();
  if (!rsvpCode) {
    throw new BaserowError(
      `Event "${eventSlug}" has no RSVP code. Add one in Sanity.`,
      0,
      "",
    );
  }

  if (guest.token) {
    return {
      token: guest.token,
      inviteUrl: buildInviteUrl(inviteBaseUrl, rsvpCode, guest.token),
    };
  }

  const config = await readBaserowConfig(env);
  const token = generateInviteToken();
  const patch = await baserowFetch(
    config,
    `/api/database/rows/table/${config.tableId}/${guest.rowId}/?user_field_names=true`,
    {
      method: "PATCH",
      body: JSON.stringify({
        Token: token,
        "Event Slug": eventSlug,
        Name: guest.name,
        Channel: guest.channel,
        Contact: guest.contact,
      }),
    },
  );

  if (!patch.ok) {
    throw new BaserowError(
      "Baserow guest token update failed",
      patch.status,
      (await patch.text()).slice(0, 300),
    );
  }

  return { token, inviteUrl: buildInviteUrl(inviteBaseUrl, rsvpCode, token) };
}
