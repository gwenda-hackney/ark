/**
 * Password-protects the site when SITE_PASSWORD is set (staging always; prod only if configured).
 * Unauthenticated visitors are sent to /gate (themed login) instead of browser basic auth.
 */
import {
  AUTH_COOKIE_NAME,
  isPublicPath,
  parseCookies,
  safeRedirectPath,
  verifyAuthToken,
} from "./_lib/site-auth.js";

export async function onRequest(context) {
  const expected = context.env.SITE_PASSWORD;
  if (!expected) return context.next();

  const url = new URL(context.request.url);
  const cookies = parseCookies(context.request.headers.get("Cookie"));
  const authed = await verifyAuthToken(expected, cookies[AUTH_COOKIE_NAME]);

  if (url.pathname === "/gate" || url.pathname === "/gate/") {
    if (authed) {
      const next = safeRedirectPath(url.searchParams.get("next"));
      return Response.redirect(new URL(next, url.origin).toString(), 302);
    }
    return context.next();
  }

  if (isPublicPath(url.pathname)) return context.next();

  if (authed) return context.next();

  const gate = new URL("/gate", url.origin);
  const next = url.pathname + url.search;
  if (next !== "/") gate.searchParams.set("next", next);

  return Response.redirect(gate.toString(), 302);
}
