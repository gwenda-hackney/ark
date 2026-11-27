import { frozenFeatures } from "../../../shared/write-freeze.js";
import { d1SubscriberRepository } from "../../../shared/guests/adapters/d1-subscribers.js";
import type { SubscriberRepository } from "../../../shared/guests/subscriber-repository.js";
import {
  normalizeEmail,
  subscribe as subscribeGuest,
  type SubscribeResult,
} from "../../../shared/guests/subscribers.js";
import { renderPortalPage, renderSuccessPage } from "./portal-html.js";
import type { Env } from "./types.js";
import { resolveRedirectUrl, resolveSubscribeTag } from "./types.js";
import { authorizeGuest } from "./unifi.js";

/**
 * The guests sign-up (the website's too), on D1.
 * Every guest is kept, seen today; `marketing` (posted only by the "Get online + what’s on" button) decides
 * the mailing list, and "Just get online" never changes an address's consent. Tests
 * hand in a repository.
 */
export function subscribeEmail(
  env: Env & { subscriberRepository?: SubscriberRepository },
  input: { email: string; tag: string; marketing: boolean },
): Promise<SubscribeResult> {
  const repo = env.subscriberRepository ?? d1SubscriberRepository(env.WEBSITE_DB);
  return subscribeGuest(repo, { ...input, visit: true });
}

export type HandlerDeps = {
  subscribe?: typeof subscribeEmail;
  authorize?: typeof authorizeGuest;
};

function html(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

/**
 * The guest's email, kept on their phone for a year after they get online,
 * so next time the page has it filled in and getting online is one tap.
 * HttpOnly: only this page reads it.
 */
const EMAIL_COOKIE = "gwenda_wifi_email";
const YEAR_SECONDS = 365 * 24 * 60 * 60;

function rememberEmail(email: string): string {
  return `${EMAIL_COOKIE}=${encodeURIComponent(email)}; Max-Age=${YEAR_SECONDS}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

/** The email this phone signed in with before, if it's still a valid one. */
function rememberedEmail(request: Request): string {
  const cookies = request.headers.get("Cookie") || "";
  for (const part of cookies.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== EMAIL_COOKIE) continue;
    try {
      return normalizeEmail(decodeURIComponent(rest.join("="))) || "";
    } catch {
      return "";
    }
  }
  return "";
}

function queryParam(url: URL, key: string): string {
  return url.searchParams.get(key)?.trim() ?? "";
}

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

async function parseForm(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  }
  const text = await request.text();
  const params = new URLSearchParams(text);
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

/** Only the "Get online + what’s on" button posts marketing; "Just get online" posts nothing. */
function marketingConsent(form: Record<string, string>): boolean {
  return Boolean(form.marketing?.trim());
}

/**
 * Keep the guest's email, seen today, with their answer to the newsletter
 * box (only a tick puts them on the mailing list). Getting online never waits on it: a sign-up that
 * can't be saved is logged (so it reaches Sentry) and the guest goes on.
 * While subscribers are frozen for a data move (#191) it isn't kept, or it
 * would be lost between the copy and the switch.
 */
async function saveSignUp(
  env: Env,
  subscribe: typeof subscribeEmail,
  email: string,
  marketing: boolean,
): Promise<void> {
  try {
    if ((await frozenFeatures(env, ["guests"])).length > 0) {
      console.log("wifi portal: guests frozen, sign-up not saved");
      return;
    }
    const saved = await subscribe(env, {
      email,
      tag: resolveSubscribeTag(env),
      marketing,
    });
    if (!saved.ok) {
      console.error(
        "[wifi-captive-portal] Sign-up not saved; guest let on anyway",
        saved.status,
        saved.error,
      );
    }
  } catch (err) {
    console.error(
      "[wifi-captive-portal] Sign-up not saved; guest let on anyway",
      err instanceof Error ? err.stack || err.message : err,
    );
  }
}

export async function handlePortalRequest(
  request: Request,
  env: Env,
  deps: HandlerDeps = {},
): Promise<Response> {
  const subscribe = deps.subscribe ?? subscribeEmail;
  const authorize = deps.authorize ?? authorizeGuest;
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);

  if (request.method === "GET" && path === "/health") {
    return Response.json({ ok: true, service: "gwenda-wifi-captive-portal" });
  }

  const isGuestPath =
    path === "/" || path === "/guest" || /^\/guest\/s\/[^/]+$/.test(path);

  if (request.method === "GET" && isGuestPath) {
    const siteMatch = path.match(/^\/guest\/s\/([^/]+)$/);
    return html(
      renderPortalPage({
        id: queryParam(url, "id"),
        ap: queryParam(url, "ap"),
        url: queryParam(url, "url"),
        ssid: queryParam(url, "ssid"),
        site: siteMatch?.[1] ?? (queryParam(url, "site") || "default"),
        email: rememberedEmail(request),
      }),
    );
  }

  if (request.method === "POST" && path === "/authorize") {
    const form = await parseForm(request);
    const email = normalizeEmail(form.email);
    const mac = (form.id ?? "").trim();
    const ap = (form.ap ?? "").trim();
    const site = (form.site ?? "").trim();
    const redirect = (form.url ?? "").trim() || resolveRedirectUrl(env);

    const pageFields = {
      id: mac,
      ap,
      url: form.url ?? "",
      ssid: form.ssid ?? "",
      site: site || "default",
      email: (form.email ?? "").trim(),
    };

    if (!email) {
      return html(
        renderPortalPage({
          ...pageFields,
          error: "That doesn’t look like a valid email.",
        }),
        400,
      );
    }

    if (!mac) {
      return html(
        renderPortalPage({
          ...pageFields,
          error:
            "Missing device details. Reconnect to the Wi‑Fi and try again.",
        }),
        400,
      );
    }

    await saveSignUp(env, subscribe, email, marketingConsent(form));

    const auth = await authorize(env, {
      mac,
      apMac: ap || undefined,
      siteIdentifier: site || undefined,
    });
    if (!auth.ok) {
      return html(
        renderPortalPage({
          ...pageFields,
          error: auth.error,
        }),
        502,
      );
    }

    return html(renderSuccessPage(redirect), 200, { "Set-Cookie": rememberEmail(email) });
  }

  return html(renderPortalPage({ error: "Page not found." }), 404);
}
