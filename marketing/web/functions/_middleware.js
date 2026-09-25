/**
 * Password-protects a preview (SITE_PREVIEW=true) and the dev website. The live site is always public.
 * Unauthenticated visitors are sent to /gate (themed login) instead of browser basic auth.
 * Optional GATE_BYPASS_KEY accepts ?access=<key> to set the gate cookie and strip the param.
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

export async function onRequest(context) {
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

  if (url.pathname === "/api/preview-share") return context.next();

  const gateUrl = new URL("/gate", url.origin);
  const next = url.pathname + url.search;
  if (next !== "/") gateUrl.searchParams.set("next", next);

  return new Response(null, {
    status: 302,
    headers: { Location: `${gateUrl.pathname}${gateUrl.search}` },
  });
}
