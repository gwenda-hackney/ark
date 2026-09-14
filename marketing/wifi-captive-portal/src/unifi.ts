import type { Env } from "./types.js";
import { resolveGuestMinutes, resolveSiteIdentifier } from "./types.js";

export type AuthorizeGuestInput = {
  mac: string;
  apMac?: string;
  siteIdentifier?: string;
};

export type AuthorizeResult =
  | { ok: true }
  | { ok: false; error: string };

function normalizeMac(raw: string): string {
  return raw.trim().toLowerCase().replace(/-/g, ":");
}

/** Cloudflare Workers rejects unbound `const f = fetch; f()` (Illegal invocation). */
function resolveFetch(fetchImpl?: typeof fetch): typeof fetch {
  return fetchImpl ?? ((input, init) => fetch(input, init));
}

/**
 * Authorize via Ubiquiti Site Manager cloud proxy (api.ui.com).
 * Works from Cloudflare when the console is online at unifi.ui.com.
 *
 * @see https://artofwifi.net/blog/unifi-api-authentication-local-admin-vs-api-key-vs-site-manager
 */
export async function authorizeGuest(
  env: Env,
  input: AuthorizeGuestInput,
  fetchImpl?: typeof fetch,
): Promise<AuthorizeResult> {
  const mac = normalizeMac(input.mac);
  if (!mac) return { ok: false, error: "Missing guest MAC address." };

  const consoleId = env.UNIFI_CONSOLE_ID?.trim();
  const apiKey = env.UNIFI_SITE_MANAGER_API_KEY?.trim();
  if (!consoleId || !apiKey) {
    return {
      ok: false,
      error: "UniFi Site Manager is not configured.",
    };
  }

  const site = input.siteIdentifier?.trim() || resolveSiteIdentifier(env);
  // Console id is used raw (may contain ':'); matches Art-of-WiFi Site Manager proxy.
  const url = `https://api.ui.com/v1/connector/consoles/${consoleId}/network/api/s/${site}/cmd/stamgr`;

  const body: Record<string, string | number> = {
    cmd: "authorize-guest",
    mac,
    minutes: resolveGuestMinutes(env),
  };
  if (input.apMac?.trim()) {
    body.ap_mac = normalizeMac(input.apMac);
  }

  const doFetch = resolveFetch(fetchImpl);
  const res = await doFetch(url, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(
      "[wifi-captive-portal] UniFi authorize failed",
      res.status,
      detail.slice(0, 300),
    );
    return {
      ok: false,
      error: `UniFi authorize failed (${res.status}).`,
    };
  }

  return { ok: true };
}
