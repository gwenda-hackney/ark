/**
 * Password-protects staging (SITE_ENV=staging). Production (SITE_ENV=production) is always public.
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
  isSearchEngineCrawler,
  matchesSecret,
  parseCookies,
  resolveGate,
  safeRedirectPath,
  verifyAuthToken,
} from "./_lib/site-auth.js";

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
      const headers = {
        Location: new URL(redirectPath, url.origin).toString(),
      };
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
      return Response.redirect(new URL(next, url.origin).toString(), 302);
    }
    return context.next();
  }

  if (isPublicPath(url.pathname)) return context.next();

  if (isSearchEngineCrawler(context.request)) return context.next();

  if (authed) return context.next();

  const gateUrl = new URL("/gate", url.origin);
  const next = url.pathname + url.search;
  if (next !== "/") gateUrl.searchParams.set("next", next);

  return Response.redirect(gateUrl.toString(), 302);
}
