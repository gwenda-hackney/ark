export type Env = {
  BASEROW_API_KEY: string;
  /** Site Manager API key from unifi.ui.com → Settings → API Keys */
  UNIFI_SITE_MANAGER_API_KEY: string;
  /** Console id from unifi.ui.com/consoles/{id}/… */
  UNIFI_CONSOLE_ID: string;
  /** Optional static assets binding (logo + fonts served by Assets). */
  ASSETS?: Fetcher;
  BASEROW_TABLE_ID?: string;
  BASEROW_API_URL?: string;
  WIFI_SUBSCRIBE_TAG?: string;
  UNIFI_SITE_IDENTIFIER?: string;
  UNIFI_GUEST_MINUTES?: string;
  REDIRECT_URL?: string;
};

export const DEFAULT_BASEROW_TABLE_ID = "1017358";
export const DEFAULT_BASEROW_API_URL = "https://api.baserow.io";
export const DEFAULT_SUBSCRIBE_TAG = "wifi";
export const DEFAULT_SITE_IDENTIFIER = "default";
export const DEFAULT_GUEST_MINUTES = 1440;
export const DEFAULT_REDIRECT_URL = "https://gwenda.co.uk";

export function resolveTableId(env: Env): string {
  return env.BASEROW_TABLE_ID?.trim() || DEFAULT_BASEROW_TABLE_ID;
}

export function resolveApiUrl(env: Env): string {
  return (env.BASEROW_API_URL?.trim() || DEFAULT_BASEROW_API_URL).replace(
    /\/$/,
    "",
  );
}

export function resolveSubscribeTag(env: Env): string {
  return env.WIFI_SUBSCRIBE_TAG?.trim() || DEFAULT_SUBSCRIBE_TAG;
}

export function resolveSiteIdentifier(env: Env): string {
  return env.UNIFI_SITE_IDENTIFIER?.trim() || DEFAULT_SITE_IDENTIFIER;
}

export function resolveGuestMinutes(env: Env): number {
  const n = Number.parseInt(env.UNIFI_GUEST_MINUTES?.trim() || "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GUEST_MINUTES;
}

export function resolveRedirectUrl(env: Env): string {
  return env.REDIRECT_URL?.trim() || DEFAULT_REDIRECT_URL;
}
