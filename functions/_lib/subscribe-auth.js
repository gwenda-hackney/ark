import { matchesSecret, parseCookies } from "./site-auth.js";

export const SUBSCRIBE_CSRF_COOKIE = "gwenda_subscribe_csrf";
const CSRF_MAX_AGE_SEC = 60 * 60;

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

/** @returns {{ kind: "ok", csrfToken: string, secret: string, setCookie: string } | { kind: "error", status: number, error: string }} */
export function issueSubscribeTokens(env, { secure = true } = {}) {
  const secret = env.SUBSCRIBE_SECRET;
  if (!secret) {
    return {
      kind: "error",
      status: 503,
      error: "Something went wrong. Try again?",
    };
  }

  const csrfToken = createCsrfToken();
  return {
    kind: "ok",
    csrfToken,
    secret,
    setCookie: buildSubscribeCsrfCookie(csrfToken, { secure }),
  };
}

/** @returns {{ ok: true } | { ok: false, status: number, error: string }} */
export function validateSubscribeAuth({ getHeader, cookies, env }) {
  const secret = env.SUBSCRIBE_SECRET;
  if (!secret) {
    return { ok: false, status: 503, error: "Something went wrong. Try again?" };
  }

  const providedSecret = getHeader("X-Subscribe-Secret") ?? "";
  if (!matchesSecret(providedSecret, secret)) {
    return { ok: false, status: 403, error: "Something went wrong. Try again?" };
  }

  const csrfHeader = getHeader("X-CSRF-Token") ?? "";
  const csrfCookie = cookies[SUBSCRIBE_CSRF_COOKIE] ?? "";
  if (!csrfHeader || !csrfCookie || !matchesSecret(csrfHeader, csrfCookie)) {
    return { ok: false, status: 403, error: "Something went wrong. Try again?" };
  }

  return { ok: true };
}

export function validateSubscribeRequest(request, env) {
  return validateSubscribeAuth({
    getHeader: (name) => request.headers.get(name),
    cookies: parseCookies(request.headers.get("Cookie")),
    env,
  });
}
