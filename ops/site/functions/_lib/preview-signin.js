/**
 * Google sign-in on dev ops branch previews (<branch>.gwenda-ops-dev.pages.dev).
 *
 * Google only redirects to registered hosts, and a branch alias can't be
 * registered in advance. So a preview sends sign-in to the main dev host, and
 * on dev the session cookie is set for the whole gwenda-ops-dev.pages.dev
 * domain: the browser sends it to every branch preview, which accept it
 * because the main host and its previews are one Pages project sharing one
 * OPS_SESSION_SECRET. After sign-in the main host sends the user back to the
 * preview they came from.
 *
 * Dev only: with SITE_ENV other than "dev" none of this applies, so prod ops
 * keeps host-only cookies and never redirects elsewhere. pages.dev is a public
 * suffix, so this cookie can't reach any other project, let alone gwenda.co.uk.
 * Hosts come from the request URL, never from X-Forwarded-Host, which a
 * client can set.
 */
export const DEV_OPS_ORIGIN = "https://gwenda-ops-dev.pages.dev";
const DEV_OPS_HOST = new URL(DEV_OPS_ORIGIN).host;
const DEV_PREVIEW_HOST = /^[a-z0-9-]{1,63}\.gwenda-ops-dev\.pages\.dev$/;

function isDev(env) {
  return String(env?.SITE_ENV || "").trim() === "dev";
}

/** True for a branch preview of dev ops (not the main dev host). */
export function isDevPreviewHost(env, host) {
  return isDev(env) && host !== DEV_OPS_HOST && DEV_PREVIEW_HOST.test(String(host || ""));
}

/** The request's own origin when it is a dev branch preview, else "". */
export function devPreviewOrigin(env, request) {
  const url = new URL(request.url);
  return url.protocol === "https:" && isDevPreviewHost(env, url.host) ? url.origin : "";
}

/**
 * Cookie Domain for the session: the dev ops domain when this request is dev
 * ops over https (main host or a preview), so previews share it; else "" for a
 * host-only cookie.
 */
export function sessionCookieDomain(env, request) {
  const url = new URL(request.url);
  if (!isDev(env) || url.protocol !== "https:") return "";
  return url.host === DEV_OPS_HOST || isDevPreviewHost(env, url.host) ? DEV_OPS_HOST : "";
}

/**
 * A `return_to` the main dev host may send a signed-in user back to: exactly
 * https://<branch>.gwenda-ops-dev.pages.dev, nothing else. "" when not allowed.
 */
export function allowedReturnTo(env, request, raw) {
  if (!raw || !isDev(env)) return "";
  if (new URL(request.url).host !== DEV_OPS_HOST) return "";
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    return "";
  }
  if (url.protocol !== "https:" || !isDevPreviewHost(env, url.host)) return "";
  if (url.origin !== String(raw).replace(/\/$/, "")) return "";
  return url.origin;
}
