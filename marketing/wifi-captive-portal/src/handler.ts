import { frozenFeatures } from "../../../shared/write-freeze.js";
import { d1SubscriberRepository } from "../../../shared/guests/adapters/d1-subscribers.js";
import type { SubscriberRepository } from "../../../shared/guests/subscriber-repository.js";
import {
  wifiGuestRepository,
  type WifiGuestRepository,
} from "../../../shared/guests/wifi-guest-repository.js";
import { recordWifiGuest } from "../../../shared/guests/wifi-guests.js";
import {
  normalizeEmail,
  subscribe as subscribeGuest,
  type SubscribeResult,
} from "../../../shared/guests/subscribers.js";
import { renderPortalPage, renderSuccessPage } from "./portal-html.js";
import type { Env } from "./types.js";
import { resolveRedirectUrl, resolveSubscribeTag } from "./types.js";
import { authorizeGuest } from "./unifi.js";

/** The guests sign-up (the website's too), on D1; Baserow is retired (#234). Tests hand in a repository. */
export function subscribeEmail(
  env: Env & { subscriberRepository?: SubscriberRepository },
  input: { email: string; tag: string },
): Promise<SubscribeResult> {
  const repo =
    env.subscriberRepository ?? d1SubscriberRepository(env.WEBSITE_DB);
  return subscribeGuest(repo, input);
}

/** Every guest who gets online, for Wi-Fi and service messages (not marketing). Tests hand in a repository. */
export function recordGuest(
  env: Env & { wifiGuestRepository?: WifiGuestRepository },
  input: { email: string },
) {
  return recordWifiGuest(wifiGuestRepository(env), input);
}

export type HandlerDeps = {
  subscribe?: typeof subscribeEmail;
  record?: typeof recordGuest;
  authorize?: typeof authorizeGuest;
};

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
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

/** The newsletter box: ticked only when the guest chose it (an unticked box isn't posted). */
function marketingConsent(form: Record<string, string>): boolean {
  return Boolean(form.marketing?.trim());
}

function logNotSaved(what: string, detail: unknown[]): void {
  console.error(
    `[wifi-captive-portal] ${what} not saved; guest let on anyway`,
    ...detail,
  );
}

/**
 * Keep the guest's email as a Wi-Fi guest and, only when they ticked the box,
 * sign them up to the newsletter (tag `wifi`). An unticked box never changes
 * an existing subscriber. Getting online never waits on either: one that
 * can't be saved is logged (so it reaches Sentry) and the guest goes on.
 * While guests are frozen for a data move (#191) neither is kept, or it
 * would be lost between the copy and the switch.
 */
async function saveSignUp(
  env: Env,
  {
    subscribe,
    record,
  }: { subscribe: typeof subscribeEmail; record: typeof recordGuest },
  email: string,
  marketing: boolean,
): Promise<void> {
  try {
    if ((await frozenFeatures(env, ["guests"])).length > 0) {
      console.log("wifi portal: guests frozen, sign-up not saved");
      return;
    }
  } catch (err) {
    logNotSaved("Sign-up", [
      err instanceof Error ? err.stack || err.message : err,
    ]);
    return;
  }

  const saves: Promise<void>[] = [
    (async () => {
      try {
        const saved = await record(env, { email });
        if (!saved.ok) logNotSaved("Wi-Fi guest", [saved.error]);
      } catch (err) {
        logNotSaved("Wi-Fi guest", [
          err instanceof Error ? err.stack || err.message : err,
        ]);
      }
    })(),
  ];
  if (marketing) {
    saves.push(
      (async () => {
        try {
          const saved = await subscribe(env, {
            email,
            tag: resolveSubscribeTag(env),
          });
          if (!saved.ok) logNotSaved("Sign-up", [saved.status, saved.error]);
        } catch (err) {
          logNotSaved("Sign-up", [
            err instanceof Error ? err.stack || err.message : err,
          ]);
        }
      })(),
    );
  }
  await Promise.all(saves);
}

export async function handlePortalRequest(
  request: Request,
  env: Env,
  deps: HandlerDeps = {},
): Promise<Response> {
  const subscribe = deps.subscribe ?? subscribeEmail;
  const record = deps.record ?? recordGuest;
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

    await saveSignUp(env, { subscribe, record }, email, marketingConsent(form));

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

    return html(renderSuccessPage(redirect));
  }

  return html(renderPortalPage({ error: "Page not found." }), 404);
}
