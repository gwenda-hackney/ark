/**
 * Keeps the router letting guests reach the portal before they sign in (#388).
 *
 * UniFi's pre-sign-in allowed list doesn't apply host names on our router
 * (UDR7, guest network in the Hotspot zone): a guest gets the pop-up but
 * can't load wifi.gwenda.co.uk unless its addresses are in the list. Those
 * are Cloudflare's, and Cloudflare changes them without notice. So every 15
 * minutes this looks the portal up and, when its addresses have changed, puts
 * the new ones in the router's list and its portal IP, and tells Sentry.
 *
 * It only touches single addresses inside Cloudflare's ranges: host names and
 * any other entries in the list stay as they are.
 */
import type { Env } from "./types.js";
import { resolveSiteIdentifier } from "./types.js";

export const PORTAL_HOSTNAME = "wifi.gwenda.co.uk";

/** Cloudflare's IPv4 ranges, https://www.cloudflare.com/ips-v4 */
const CLOUDFLARE_V4 = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
];

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipToInt(ip: string): number | null {
  const m = IPV4.exec(ip.trim());
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/** A single address (no /mask) in Cloudflare's ranges: one we manage. */
export function isCloudflareAddress(entry: string): boolean {
  const ip = ipToInt(entry);
  if (ip === null) return false;
  return CLOUDFLARE_V4.some((range) => {
    const [base, bits] = range.split("/");
    const mask = bits === "0" ? 0 : (~0 << (32 - Number(bits))) >>> 0;
    return ((ip & mask) >>> 0) === ((ipToInt(base)! & mask) >>> 0);
  });
}

type FetchFn = typeof fetch;

/** Cloudflare Workers rejects unbound `const f = fetch; f()` (Illegal invocation). */
function resolveFetch(fetchImpl?: FetchFn): FetchFn {
  return fetchImpl ?? ((input, init) => fetch(input, init));
}

/** The portal's current IPv4 addresses, sorted, over DNS-over-HTTPS. */
export async function lookUpPortal(fetchImpl?: FetchFn): Promise<string[]> {
  const res = await resolveFetch(fetchImpl)(
    `https://cloudflare-dns.com/dns-query?name=${PORTAL_HOSTNAME}&type=A`,
    { headers: { Accept: "application/dns-json" } },
  );
  if (!res.ok) throw new Error(`DNS lookup of ${PORTAL_HOSTNAME} failed (${res.status})`);
  const body = (await res.json()) as { Answer?: { type: number; data: string }[] };
  const addresses = (body.Answer ?? [])
    .filter((a) => a.type === 1 && ipToInt(a.data) !== null)
    .map((a) => a.data);
  if (!addresses.length) throw new Error(`DNS lookup of ${PORTAL_HOSTNAME} returned no addresses`);
  return [...new Set(addresses)].sort();
}

/** UniFi's hotspot settings: the allowed list is allowed_subnet_1, _2, … */
export type GuestAccess = Record<string, unknown> & {
  _id: string;
  key: "guest_access";
  custom_ip?: string;
};

const SLOT = /^allowed_subnet_(\d+)$/;

function allowedEntries(settings: GuestAccess): string[] {
  return Object.keys(settings)
    .map((k) => [k, SLOT.exec(k)] as const)
    .filter(([, m]) => m)
    .sort(([, a], [, b]) => Number(a![1]) - Number(b![1]))
    .map(([k]) => String(settings[k] ?? "").trim())
    .filter(Boolean);
}

export type AddressPlan = {
  changed: boolean;
  before: { portalIp: string; allowed: string[] };
  after: { portalIp: string; allowed: string[] };
  settings: GuestAccess;
};

/**
 * The settings with the portal's current addresses: other entries kept in
 * order, our addresses after them, the portal IP the first address. Slots no
 * longer used are emptied, which is how UniFi removes an entry.
 */
export function planPortalAddresses(settings: GuestAccess, addresses: string[]): AddressPlan {
  const current = allowedEntries(settings);
  const kept = current.filter((e) => !isCloudflareAddress(e));
  const ours = current.filter(isCloudflareAddress);
  const allowed = [...kept, ...addresses];
  const before = { portalIp: String(settings.custom_ip ?? ""), allowed: current };
  // Any current address will do; keep the one the router has if it still is.
  const portalIp = addresses.includes(before.portalIp) ? before.portalIp : addresses[0];
  const changed =
    before.portalIp !== portalIp ||
    [...ours].sort().join(",") !== [...addresses].sort().join(",");

  const next: GuestAccess = { ...settings, custom_ip: portalIp };
  for (const k of Object.keys(next)) if (SLOT.test(k)) next[k] = "";
  allowed.forEach((entry, i) => {
    next[`allowed_subnet_${i + 1}`] = entry;
  });
  return { changed, before, after: { portalIp, allowed }, settings: next };
}

function siteManagerBase(env: Env): string {
  const consoleId = env.UNIFI_CONSOLE_ID?.trim();
  if (!consoleId || !env.UNIFI_SITE_MANAGER_API_KEY?.trim()) {
    throw new Error("UniFi Site Manager is not configured.");
  }
  return `https://api.ui.com/v1/connector/consoles/${consoleId}/network/api/s/${resolveSiteIdentifier(env)}`;
}

async function siteManager(
  env: Env,
  doFetch: FetchFn,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const res = await doFetch(`${siteManagerBase(env)}/${path}`, {
    ...init,
    headers: {
      "X-API-KEY": env.UNIFI_SITE_MANAGER_API_KEY.trim(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`UniFi ${init.method ?? "GET"} ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

export type SyncResult =
  | { status: "unchanged"; addresses: string[] }
  | { status: "updated"; plan: AddressPlan };

/** Look the portal up and bring the router's hotspot settings in line. */
export async function syncPortalAddresses(env: Env, fetchImpl?: FetchFn): Promise<SyncResult> {
  const doFetch = resolveFetch(fetchImpl);
  const addresses = await lookUpPortal(doFetch);
  const all = (await siteManager(env, doFetch, "rest/setting")) as { data?: GuestAccess[] };
  const settings = all.data?.find((s) => s.key === "guest_access");
  if (!settings) throw new Error("UniFi has no guest_access settings");

  const plan = planPortalAddresses(settings, addresses);
  if (!plan.changed) return { status: "unchanged", addresses };

  await siteManager(env, doFetch, `rest/setting/guest_access/${settings._id}`, {
    method: "PUT",
    body: JSON.stringify(plan.settings),
  });
  return { status: "updated", plan };
}

/**
 * The scheduled run. A change or a failure is logged with console.error, which
 * Sentry turns into an alert emailed to alerts@ (the project's default
 * "high priority issues" rule); a quiet run just logs a line.
 */
export async function runPortalAddressCheck(env: Env, fetchImpl?: FetchFn): Promise<SyncResult | null> {
  try {
    const result = await syncPortalAddresses(env, fetchImpl);
    if (result.status === "updated") {
      const { before, after } = result.plan;
      console.error(
        `[wifi-captive-portal] The portal's addresses changed: the router now lets guests reach ${after.portalIp} (was ${before.portalIp || "none"}). Allowed before sign-in: ${after.allowed.join(", ")} (was ${before.allowed.join(", ")}).`,
      );
    } else {
      console.log(`[wifi-captive-portal] Portal addresses unchanged: ${result.addresses.join(", ")}`);
    }
    return result;
  } catch (err) {
    console.error(
      "[wifi-captive-portal] Couldn't check the router lets guests reach the portal:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
