/**
 * Password-protects the whole ops Pages project (OPS_PASSWORD).
 * Unauthenticated visitors are sent to /gate/.
 */
import {
  AUTH_COOKIE_NAME,
  buildAuthCookie,
  createAuthToken,
  gateMisconfiguredResponse,
  isPublicPath,
  matchesSecret,
  parseCookies,
  resolveGate,
  safeRedirectPath,
  verifyAuthToken,
} from "./_lib/auth.js";

export async function onRequest(context) {
  const gate = resolveGate(context.env);
  if (gate.kind === "misconfigured") return gateMisconfiguredResponse();

  const expected = gate.password;
  const url = new URL(context.request.url);
  const cookies = parseCookies(context.request.headers.get("Cookie"));
  const authed = await verifyAuthToken(expected, cookies[AUTH_COOKIE_NAME]);
  const bypassKey = context.env.OPS_BYPASS_KEY;
  const accessParam = url.searchParams.get("access");

  if (bypassKey && accessParam && matchesSecret(accessParam, bypassKey)) {
    const clean = new URL(url);
    clean.searchParams.delete("access");
    const headers = { Location: clean.pathname + clean.search };
    if (!authed) {
      const token = await createAuthToken(expected);
      headers["Set-Cookie"] = buildAuthCookie(token);
    }
    return new Response(null, { status: 302, headers });
  }

  if (isPublicPath(url.pathname)) {
    if ((url.pathname === "/gate" || url.pathname === "/gate/") && authed) {
      const next = safeRedirectPath(url.searchParams.get("next"));
      return Response.redirect(new URL(next, url.origin).toString(), 302);
    }
    return context.next();
  }

  if (authed) return context.next();

  const gateUrl = new URL("/gate/", url.origin);
  const next = url.pathname + url.search;
  if (next !== "/") gateUrl.searchParams.set("next", next);
  return Response.redirect(gateUrl.toString(), 302);
}
