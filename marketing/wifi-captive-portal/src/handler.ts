import { frozenFeatures } from "../../../shared/write-freeze.js";
import { subscriberRepository } from "../../../shared/guests/subscriber-repository.js";
import {
  normalizeEmail,
  subscribe as subscribeGuest,
  type SubscribeResult,
} from "../../../shared/guests/subscribers.js";
import { renderPortalPage, renderSuccessPage } from "./portal-html.js";
import type { Env } from "./types.js";
import { resolveRedirectUrl, resolveSubscribeTag } from "./types.js";
import { authorizeGuest } from "./unifi.js";

/** The guests sign-up (the website's too), wherever subscribers live now. */
export function subscribeEmail(
  env: Env,
  input: { email: string; tag: string },
): Promise<SubscribeResult> {
  return subscribeGuest(subscriberRepository(env), input);
}

export type HandlerDeps = {
  subscribe?: typeof subscribeEmail;
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

    // While subscribers move to D1 (#191), guests still get online; only the
    // sign-up isn't kept, or it would be lost between the copy and the switch.
    const frozen = (await frozenFeatures(env, ["guests"])).length > 0;
    if (frozen) console.log("wifi portal: guests frozen, sign-up not saved");
    const saved = frozen
      ? { ok: true as const }
      : await subscribe(env, { email, tag: resolveSubscribeTag(env) });

    if (!saved.ok) {
      return html(
        renderPortalPage({
          ...pageFields,
          error: saved.error,
        }),
        saved.status,
      );
    }

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
