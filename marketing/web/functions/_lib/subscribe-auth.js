/**
 * What lets a sign-up or form POST through: it comes from a page on this
 * site. Two checks, no shared secret (a value the browser holds is public):
 *  - CSRF double submit: GET hands the page a random token in the JSON and
 *    the same token in an HttpOnly, SameSite=Strict cookie; the POST sends it
 *    back as X-CSRF-Token, and the two must match.
 *  - Same origin: the POST's Origin header (or, without one, its Referer) is
 *    the site's own address. Browsers send Origin on every fetch POST.
 * SUBSCRIBE_SECRET signs the form and ticket links and never leaves the server.
 */
import { matchesSecret, parseCookies } from "./site-auth.js";

export const SUBSCRIBE_CSRF_COOKIE = "gwenda_subscribe_csrf";
const CSRF_MAX_AGE_SEC = 60 * 60;
const REFUSED = {
  ok: false,
  status: 403,
  error: "Something went wrong. Try again?",
};

function bufferToBase64Url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createCsrfToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bufferToBase64Url(bytes);
}

export function buildSubscribeCsrfCookie(token, { secure = true } = {}) {
  const parts = [
    `${SUBSCRIBE_CSRF_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${CSRF_MAX_AGE_SEC}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/**
 * A fresh CSRF token for the page, and the cookie that carries its twin.
 * @returns {{ csrfToken: string, setCookie: string }}
 */
export function issueSubscribeTokens({ secure = true } = {}) {
  const csrfToken = createCsrfToken();
  return {
    csrfToken,
    setCookie: buildSubscribeCsrfCookie(csrfToken, { secure }),
  };
}

function originOf(value) {
  if (!value) return "";
  try {
    const { origin } = new URL(String(value));
    return origin === "null" ? "" : origin;
  } catch {
    return "";
  }
}

/**
 * Whether the request says it comes from `origin` (the site's own, from the
 * request URL): its Origin header, or its Referer when there is no Origin.
 * `Origin: null` (a sandboxed or privacy-redirected page) and a request with
 * neither header are refused.
 */
export function isSameOriginRequest({ getHeader, origin }) {
  const expected = originOf(origin);
  if (!expected) return false;
  const claimed = getHeader("Origin") || getHeader("Referer") || "";
  return originOf(claimed) === expected;
}

/**
 * @param {{
 *   getHeader: (name: string) => string | null | undefined,
 *   cookies: Record<string, string>,
 *   origin: string,
 * }} request  `origin` is the site's address as this request reached it.
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
export function validateSubscribeAuth({ getHeader, cookies, origin }) {
  if (!isSameOriginRequest({ getHeader, origin })) return REFUSED;

  const csrfHeader = getHeader("X-CSRF-Token") ?? "";
  const csrfCookie = cookies[SUBSCRIBE_CSRF_COOKIE] ?? "";
  if (!csrfHeader || !csrfCookie || !matchesSecret(csrfHeader, csrfCookie)) {
    return REFUSED;
  }

  return { ok: true };
}

export function validateSubscribeRequest(request) {
  return validateSubscribeAuth({
    getHeader: (name) => request.headers.get(name),
    cookies: parseCookies(request.headers.get("Cookie")),
    origin: new URL(request.url).origin,
  });
}
