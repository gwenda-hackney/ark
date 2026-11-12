/**
 * Ops auth: Google OAuth on hosted ops and `npm run ops:prod`; on a
 * developer's machine (`npm run ops:dev`) the developer is signed in as
 * themselves (localSignInEmail). Either way the ops users list decides who
 * gets in. No Cloudflare Access.
 */
import { isLocalMachine } from "../../../../../shared/config.js";
import { canonicalizePath } from "../../app/spa-path.js";

export const AUTH_COOKIE_NAME = "gwenda_ops_access";
export const OAUTH_STATE_COOKIE = "gwenda_ops_oauth";
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 14;
const SESSION_SCOPE = "gwenda-ops-google-session-v1";
const OAUTH_STATE_SCOPE = "gwenda-ops-oauth-state-v1";

function bufferToBase64Url(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function bytesToBase64Url(bytes) {
  return bufferToBase64Url(bytes);
}

async function hmacSign(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return bufferToBase64Url(sig);
}

export function matchesSecret(provided, expected) {
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function googleClientId(env = {}) {
  return env.GOOGLE_OAUTH_CLIENT_ID?.trim() || "";
}

export function googleClientSecret(env = {}) {
  return env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || "";
}

export function sessionSecret(env = {}) {
  return env.OPS_SESSION_SECRET?.trim() || "";
}

/**
 * Who `npm run ops:dev` signs in, or "" when this runtime must not. Google's
 * OAuth client doesn't know every local address, so plain local ops binds
 * OPS_LOCAL_SIGN_IN to the developer's email (scripts/ops-dev.mjs) and skips
 * Google; the ops users list still decides whether they get in.
 *
 * Honoured only on a developer's machine working on the dev copies: SITE_ENV
 * exactly "local" (never production or dev, one of which every deployed ops
 * sets) and no OPS_LOCAL_LIVE (`npm run ops:prod` keeps Google sign-in). So a
 * deployed ops ignores the binding even if it were set there by mistake.
 */
export function localSignInEmail(env = {}) {
  const email = normalizeEmail(env.OPS_LOCAL_SIGN_IN);
  if (!email) return "";
  const siteEnv = String(env.SITE_ENV || "").trim().toLowerCase();
  if (siteEnv !== "local" || !isLocalMachine(env)) return "";
  if (String(env.OPS_LOCAL_LIVE || "").trim()) return "";
  return email;
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{
 *   kind: "local" | "google" | "misconfigured",
 *   email?: string,
 *   sessionSecret?: string,
 *   googleClientId?: string,
 *   googleClientSecret?: string,
 * }}
 */
export function resolveAuth(env) {
  const local = localSignInEmail(env);
  if (local) return { kind: "local", email: local };

  const clientId = googleClientId(env);
  const clientSecret = googleClientSecret(env);
  const secret = sessionSecret(env);
  if (clientId && clientSecret && secret) {
    return {
      kind: "google",
      sessionSecret: secret,
      googleClientId: clientId,
      googleClientSecret: clientSecret,
    };
  }
  return { kind: "misconfigured" };
}

export function authMisconfiguredResponse() {
  return new Response(
    "Ops site requires Google OAuth (GOOGLE_OAUTH_CLIENT_ID/SECRET + OPS_SESSION_SECRET).",
    { status: 503 },
  );
}

export const NOT_OPS_USER = "not_ops_user";

/**
 * 403 for someone signed in but not on the ops users list. `auth` is how they
 * were signed in: for local sign-in the page names the email and offers no
 * sign-out, which would only come back here.
 */
export function opsUserForbiddenResponse({ json = false, auth = null } = {}) {
  const message = "That Google account is not on the ops users list.";
  if (json) {
    // The SPA keys on `code` (src/app/boot.ts), not the wording.
    return new Response(JSON.stringify({ error: message, code: NOT_OPS_USER }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(forbiddenPage(auth?.kind === "local" ? auth.email : ""), {
    status: 403,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Same look as the splash in index.html and the gate. System fonts only.
 * `localEmail`: signed in by `npm run ops:dev`, which no sign-out changes.
 */
function forbiddenPage(localEmail = "") {
  const text = localEmail
    ? `Ops on this machine signs you in as ${escapeHtml(localEmail)}, which is not on the ops users list. Ask an admin to add it, or set FORMS_NOTIFY_EMAIL in .env to an address that is and restart npm run ops:dev.`
    : "That Google account is not on the ops users list. Sign out and use another account, or ask an admin to add you.";
  const action = localEmail
    ? `<a href="/">Try again</a>`
    : `<a href="/api/auth/logout">Sign out</a>`;
  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Not on the list · Gwenda Operations</title>
<link rel="icon" href="/favicon.ico" sizes="any">
<style>
html,body{margin:0;min-height:100%;background:#0b0b0c;color:#ece8e1;color-scheme:dark}
body{min-height:100vh;display:grid;place-items:center;padding:1.5rem;box-sizing:border-box;
  font:400 14px/20px ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{display:grid;justify-items:center;gap:12px;text-align:center;max-width:22rem}
.mark{display:grid;place-items:center;width:56px;height:56px;border-radius:12px;background:#c9a84c;
  color:#0b0b0c;font:600 30px/1 Georgia,"Times New Roman",serif}
.name{margin:4px 0 12px;font-size:11px;line-height:16px;font-weight:600;letter-spacing:.14em;
  text-transform:uppercase;color:#a29d95}
h1{margin:0;font-size:16px;line-height:24px;font-weight:600}
p{margin:0;color:#a29d95}
a{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;margin-top:8px;border-radius:8px;
  border:1px solid rgba(255,255,255,.12);color:#ece8e1;text-decoration:none;font-weight:500}
a:hover{background:#202023}
a:focus-visible{outline:2px solid #c9a84c;outline-offset:2px}
</style>
</head>
<body>
<main>
  <div class="mark" aria-hidden="true">G</div>
  <div class="name">Gwenda · Operations</div>
  <h1>Not on the ops users list</h1>
  <p>${text}</p>
  ${action}
</main>
</body>
</html>
`;
}

/** Signed session: email.exp.sig */
export async function createSessionToken(secret, email, maxAgeSec = COOKIE_MAX_AGE_SEC) {
  const normalized = normalizeEmail(email);
  if (!secret || !normalized) return "";
  const exp = Math.floor(Date.now() / 1000) + maxAgeSec;
  const payload = `${normalized}.${exp}`;
  const sig = await hmacSign(secret, `${SESSION_SCOPE}:${payload}`);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(secret, token) {
  if (!secret || !token) return "";
  // email may contain dots — split from the right: email.exp.sig
  const raw = String(token);
  const sigDot = raw.lastIndexOf(".");
  if (sigDot <= 0) return "";
  const sig = raw.slice(sigDot + 1);
  const withoutSig = raw.slice(0, sigDot);
  const expDot = withoutSig.lastIndexOf(".");
  if (expDot <= 0) return "";
  const email = normalizeEmail(withoutSig.slice(0, expDot));
  const exp = Number(withoutSig.slice(expDot + 1));
  if (!email || !sig || !Number.isFinite(exp)) return "";
  if (exp < Math.floor(Date.now() / 1000)) return "";
  const payload = `${email}.${exp}`;
  const expected = await hmacSign(secret, `${SESSION_SCOPE}:${payload}`);
  if (!matchesSecret(sig, expected)) return "";
  return email;
}

/**
 * OAuth state cookie: state, PKCE verifier and, on dev only, the branch
 * preview origin to send the user back to after sign-in (preview-signin.js).
 */
export async function createOauthStateToken(secret, state, codeVerifier, returnTo = "") {
  if (!secret || !state || !codeVerifier) return "";
  // state and verifier are url-safe and an origin has no "|": join with it
  const payload = returnTo ? `${state}|${codeVerifier}|${returnTo}` : `${state}|${codeVerifier}`;
  const sig = await hmacSign(secret, `${OAUTH_STATE_SCOPE}:${payload}`);
  return `${payload}.${sig}`;
}

export async function verifyOauthStateToken(secret, token) {
  if (!secret || !token) return null;
  const raw = String(token);
  const sigDot = raw.lastIndexOf(".");
  if (sigDot <= 0) return null;
  const sig = raw.slice(sigDot + 1);
  const payload = raw.slice(0, sigDot);
  const [state, codeVerifier, returnTo = "", ...extra] = payload.split("|");
  if (!state || !codeVerifier || extra.length || !sig) return null;
  const expected = await hmacSign(secret, `${OAUTH_STATE_SCOPE}:${payload}`);
  if (!matchesSecret(sig, expected)) return null;
  return { state, codeVerifier, returnTo };
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key) out[key] = decodeURIComponent(rest.join("="));
  }
  return out;
}

/** `domain` is set only for the dev session shared with branch previews (preview-signin.js). */
function cookieParts(name, value, { secure = true, maxAge = COOKIE_MAX_AGE_SEC, domain = "" } = {}) {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (domain) parts.push(`Domain=${domain}`);
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildAuthCookie(token, opts = {}) {
  return cookieParts(AUTH_COOKIE_NAME, token, opts);
}

export function clearAuthCookie(opts = {}) {
  return cookieParts(AUTH_COOKIE_NAME, "", { ...opts, maxAge: 0 });
}

export function buildOauthStateCookie(token, opts = {}) {
  return cookieParts(OAUTH_STATE_COOKIE, token, { ...opts, maxAge: 600 });
}

export function clearOauthStateCookie(opts = {}) {
  return cookieParts(OAUTH_STATE_COOKIE, "", { ...opts, maxAge: 0 });
}

export function isPublicPath(pathname) {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/gate") return true;
  if (p === "/robots.txt") return true;
  if (p === "/favicon.ico" || p === "/favicon.svg" || p === "/favicon.png") return true;
  if (p === "/apple-touch-icon.png") return true;
  if (p === "/api/auth" || p.startsWith("/api/auth/")) return true;
  // Scheduler tick from the site-deploy webhook; checks its own bearer secret.
  if (p === "/api/web/tick") return true;
  return false;
}

/** True for JSON API routes that must not 302 to the HTML gate. */
export function isProtectedApiPath(pathname) {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/api" || p.startsWith("/api/")) return !isPublicPath(pathname);
  return false;
}

/**
 * Browser-facing origin. Vite's Pages proxy sets X-Forwarded-Host to :5174;
 * Wrangler itself is :8788. Cookies must use the former.
 */
export function requestOrigin(request) {
  const url = new URL(request.url);
  const host = request.headers.get("X-Forwarded-Host")?.split(",")[0].trim();
  const proto = request.headers.get("X-Forwarded-Proto")?.split(",")[0].trim();
  return `${proto || url.protocol.replace(":", "")}://${host || url.host}`;
}

export function isSecureOrigin(origin) {
  return origin.startsWith("https:");
}

/** Relative Location so a proxied SPA never leaves its own origin. */
export function relativeRedirect(path, status = 302) {
  return new Response(null, { status, headers: { Location: path } });
}

export function signInRequiredResponse() {
  return new Response(JSON.stringify({ error: "Sign in required." }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export function gateRedirectPath(next) {
  const safe = safeRedirectPath(next);
  if (safe === "/") return "/gate/";
  return `/gate/?next=${encodeURIComponent(safe)}`;
}

/** Stands in for this site's origin when reading `next` (never fetched). */
const REDIRECT_BASE = "https://this-site.invalid";

/**
 * Where to send someone after sign-in: a path on this site, or "/".
 * `next` is read as a browser would read the Location (backslashes count as
 * slashes, tabs and newlines vanish), so only a path on this site gets
 * through; its query is kept, its anchor dropped.
 */
export function safeRedirectPath(next) {
  if (!next || typeof next !== "string") return "/";
  const clean = pathOnThisSite(canonicalizePath(next));
  if (!clean) return "/";
  if (clean.startsWith("/gate")) return "/";
  if (clean.startsWith("/api/auth")) return "/";
  if (clean.startsWith("/api/menu")) return "/menu";
  if (clean.startsWith("/api/inventory/lightspeed")) return "/lightspeed";
  if (clean.startsWith("/api/inventory")) return "/inventory";
  if (clean.startsWith("/api/suppliers")) return "/suppliers";
  if (clean.startsWith("/api/venue/gallery")) return "/venue/gallery";
  if (clean.startsWith("/api/venue")) return "/venue";
  if (clean.startsWith("/api/")) return "/";
  return clean;
}

/** `href` as path and query, if a browser following it stays on this site; else "". */
function pathOnThisSite(href) {
  if (!href.startsWith("/")) return "";
  let url;
  try {
    url = new URL(href, REDIRECT_BASE);
  } catch {
    return "";
  }
  if (url.origin !== REDIRECT_BASE) return "";
  // Dot segments can leave "//" at the start: a path starts with one "/".
  if (url.pathname.startsWith("//")) return "";
  return url.pathname + url.search;
}

/** The signed-in email for this request, or "" when nobody is signed in. */
export async function resolveSessionEmail(request, auth) {
  if (auth.kind === "local") return auth.email;
  if (auth.kind === "google" && auth.sessionSecret) {
    const cookies = parseCookies(request.headers.get("Cookie"));
    return verifySessionToken(auth.sessionSecret, cookies[AUTH_COOKIE_NAME]);
  }
  return "";
}

/** Signed in; whether they are on the ops users list is checked separately. */
export async function isRequestAuthed(auth, request) {
  return Boolean(await resolveSessionEmail(request, auth));
}
