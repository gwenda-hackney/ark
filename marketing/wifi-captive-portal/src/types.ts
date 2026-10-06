export type Env = {
  /** The Website Baserow token, while subscribers are on Baserow (#127). */
  BASEROW_API_KEY: string;
  /** Site Manager API key from unifi.ui.com → Settings → API Keys */
  UNIFI_SITE_MANAGER_API_KEY: string;
  /** Console id from unifi.ui.com/consoles/{id}/… */
  UNIFI_CONSOLE_ID: string;
  /** Optional static assets binding (logo + fonts served by Assets). */
  ASSETS?: Fetcher;
  /** Optional. Only needed if the token can see more than one Subscribers table. */
  BASEROW_DATABASE_ID?: string;
  BASEROW_SUBSCRIBE_TABLE_NAME?: string;
  BASEROW_API_URL?: string;
  WIFI_SUBSCRIBE_TAG?: string;
  UNIFI_SITE_IDENTIFIER?: string;
  UNIFI_GUEST_MINUTES?: string;
  REDIRECT_URL?: string;
  /** The website D1 database (#127): subscribers once guests move, and the write freeze (#191). */
  WEBSITE_DB?: unknown;
};

export const DEFAULT_SUBSCRIBE_TAG = "wifi";
export const DEFAULT_SITE_IDENTIFIER = "default";
export const DEFAULT_GUEST_MINUTES = 1440;
export const DEFAULT_REDIRECT_URL = "https://gwenda.co.uk";

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
