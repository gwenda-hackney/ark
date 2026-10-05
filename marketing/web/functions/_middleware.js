/**
 * Password-protects a preview (SITE_PREVIEW=true) and the dev website. The live site is always public.
 * Unauthenticated visitors are sent to /gate (themed login) instead of browser basic auth.
 * Optional GATE_BYPASS_KEY accepts ?access=<key> to set the gate cookie and strip the param.
 * Sign in with Google goes through ops, which sends you back with ?pass= (shared/website-pass.js).
 */
import {
  AUTH_COOKIE_NAME,
  buildAuthCookie,
  createAuthToken,
  gateBypassRedirectPath,
  gateMisconfiguredResponse,
  isPublicPath,
  isUnauthenticatedCrawler,
  matchesSecret,
  parseCookies,
  resolveGate,
  safeRedirectPath,
  verifyAuthToken,
} from "./_lib/site-auth.js";
import { verifyFormsAdminRequest } from "./_lib/admin-auth.js";
import {
  WEBSITE_PASS_PARAM,
  opsUrlFor,
  verifyWebsitePass,
} from "../../../shared/website-pass.js";
import {
  captureConsoleIntegration,
  sentryPagesPlugin,
} from "@sentry/cloudflare";
import { sentryOptions } from "../../../shared/sentry.js";
import {
  featuresForPath,
  frozenWriteResponse,
  isWriteRequest,
} from "../../../shared/write-freeze.js";

/** Which features each website API path writes, for the write freeze (#191). */
export const WEB_WRITE_FEATURES = [
  [/^\/api\/(subscribe|forms|rsvp|ticket)(\/|$)/, ["guests"]],
];

// Sentry first (#35): thrown errors, and console.error from the functions
// (a form email that failed, a Baserow write that didn't land).
export const onRequest = [
  sentryPagesPlugin((context) => ({
    ...sentryOptions(context.env, "web"),
    integrations: [captureConsoleIntegration({ levels: ["error"] })],
  })),
  refuseFrozenWrites,
  gate,
];

/** While guests' data moves to D1, sign-ups, forms and RSVPs wait (#191). */
export async function refuseFrozenWrites(context) {
  const url = new URL(context.request.url);
  if (url.pathname.startsWith("/api/") && isWriteRequest(context.request)) {
    const refused = await frozenWriteResponse(
      context.env,
      featuresForPath(url.pathname, WEB_WRITE_FEATURES),
    );
    if (refused) return refused;
  }
  return context.next();
}

export async function gate(context) {
  const gate = resolveGate(context.env);
  if (gate.kind === "misconfigured") return gateMisconfiguredResponse();
  if (gate.kind === "open") return context.next();

  const expected = gate.password;
  const url = new URL(context.request.url);
  const cookies = parseCookies(context.request.headers.get("Cookie"));
  const authed = await verifyAuthToken(expected, cookies[AUTH_COOKIE_NAME]);
  const bypassKey = context.env.GATE_BYPASS_KEY;
  const accessParam = url.searchParams.get("access");

  if (bypassKey && accessParam && matchesSecret(accessParam, bypassKey)) {
    const redirectPath = gateBypassRedirectPath(url);
    if (redirectPath) {
      const headers = { Location: redirectPath };
      if (!authed) {
        const token = await createAuthToken(expected);
        headers["Set-Cookie"] = buildAuthCookie(token);
      }
      return new Response(null, { status: 302, headers });
    }
  }

  // Sign in with Google: ops signs you in and checks the users list.
  if (url.pathname === "/gate/google") {
    const next = safeRedirectPath(url.searchParams.get("next"));
    const ops = new URL("/website-pass", opsUrlFor(context.env.SITE_ENV));
    ops.searchParams.set("return", new URL(next, url.origin).href);
    return new Response(null, { status: 302, headers: { Location: ops.href } });
  }

  // Back from ops with a pass for this site: remember this browser.
  const pass = url.searchParams.get(WEBSITE_PASS_PARAM);
  if (pass && (await verifyWebsitePass(bypassKey, pass, url.host))) {
    const clean = new URL(url);
    clean.searchParams.delete(WEBSITE_PASS_PARAM);
    const headers = {
      Location: clean.pathname + clean.search,
      "Cache-Control": "no-store",
    };
    if (!authed)
      headers["Set-Cookie"] = buildAuthCookie(await createAuthToken(expected));
    return new Response(null, { status: 302, headers });
  }

  if (url.pathname === "/gate" || url.pathname === "/gate/") {
    if (authed) {
      const next = safeRedirectPath(url.searchParams.get("next"));
      return new Response(null, { status: 302, headers: { Location: next } });
    }
    return context.next();
  }

  if (isPublicPath(url.pathname)) return context.next();

  if (url.pathname.startsWith("/api/forms/admin/")) {
    if (verifyFormsAdminRequest(context.request, context.env)) {
      return context.next();
    }
  }

  if (isUnauthenticatedCrawler(context.request)) return context.next();

  if (authed) return context.next();

  const gateUrl = new URL("/gate", url.origin);
  const next = url.pathname + url.search;
  if (next !== "/") gateUrl.searchParams.set("next", next);

  return new Response(null, {
    status: 302,
    headers: { Location: `${gateUrl.pathname}${gateUrl.search}` },
  });
}
