/**
 * Ops auth: Cloudflare Access in production, OPS_PASSWORD or local Access sim.
 *
 * Local Access: OPS_AUTH_MODE=access. Signs in with an email at /gate/, then
 * checks the Baserow Users table (same membership path as production).
 * Real Google/Access only runs on gwenda-ops.pages.dev.
 */
import { canonicalizePath } from "./spa-path.js";

export const AUTH_COOKIE_NAME = "gwenda_ops_access";
export const ACCESS_EMAIL_HEADER = "Cf-Access-Authenticated-User-Email";
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 14;
const ACCESS_EMAIL_SCOPE = "gwenda-ops-access-email-v1";

function bufferToBase64Url(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{
 *   kind: "access" | "password",
 *   local?: boolean,
 *   password?: string,
 *   sessionSecret?: string,
 *   defaultEmail?: string,
 * }}
 */
export function resolveAuth(env) {
  const password = env.OPS_PASSWORD?.trim() || "";
  const sessionSecret =
    env.OPS_DEV_ACCESS_SECRET?.trim() || password || "";
  const defaultEmail = normalizeEmail(env.OPS_DEV_ACCESS_EMAIL);
  const authMode = String(env.OPS_AUTH_MODE || "")
    .trim()
    .toLowerCase();

  if (authMode === "access") {
    return {
      kind: "access",
      local: true,
      sessionSecret: sessionSecret || undefined,
      defaultEmail: defaultEmail || undefined,
    };
  }
  if (password) return { kind: "password", password };
  return { kind: "access", local: false };
}

export function authMisconfiguredResponse() {
  return new Response(
    "Ops site requires Cloudflare Access or OPS_PASSWORD.",
    { status: 503 },
  );
}

export function accessRequiredResponse() {
  return new Response("This host must be behind Cloudflare Access.", {
    status: 403,
  });
}

export function opsUserForbiddenResponse({ json = false } = {}) {
  const message = "That Google account is not on the ops users list.";
  if (json) {
    return new Response(JSON.stringify({ error: message }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(message, { status: 403 });
}

/** Password-gate token (HMAC of scope only). */
export async function createPasswordToken(password) {
  return hmacSign(password, "gwenda-ops-gate-v1");
}

export async function verifyPasswordToken(password, token) {
  if (!token || !password) return false;
  const expected = await createPasswordToken(password);
  return matchesSecret(token, expected);
}

/** Local Access-sim cookie: email + HMAC. */
export async function createAccessEmailToken(secret, email) {
  const normalized = normalizeEmail(email);
  if (!secret || !normalized) return "";
  const sig = await hmacSign(secret, `${ACCESS_EMAIL_SCOPE}:${normalized}`);
  return `${normalized}.${sig}`;
}

export async function verifyAccessEmailToken(secret, token) {
  if (!secret || !token) return "";
  const dot = String(token).lastIndexOf(".");
  if (dot <= 0) return "";
  const email = normalizeEmail(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!email || !sig) return "";
  const expected = await createAccessEmailToken(secret, email);
  if (!matchesSecret(token, expected)) return "";
  return email;
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

export function buildAuthCookie(token, { secure = true, maxAge = COOKIE_MAX_AGE_SEC } = {}) {
  const parts = [
    `${AUTH_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearAuthCookie({ secure = true } = {}) {
  const parts = [
    `${AUTH_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function isPublicPath(pathname) {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/gate") return true;
  if (p === "/robots.txt") return true;
  if (p === "/favicon.ico" || p === "/favicon.svg") return true;
  if (p === "/api/auth" || p.startsWith("/api/auth/")) return true;
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

export function accessLogoutPath() {
  return "/cdn-cgi/access/logout";
}

export function safeRedirectPath(next) {
  if (!next || typeof next !== "string") return "/";
  const clean = canonicalizePath(next);
  if (!clean.startsWith("/") || clean.startsWith("//")) return "/";
  if (clean.startsWith("/gate")) return "/";
  if (clean.startsWith("/api/auth")) return "/";
  if (clean.startsWith("/api/menu")) return "/menu";
  if (clean.startsWith("/api/inventory")) return "/inventory";
  if (clean.startsWith("/api/")) return "/";
  return clean;
}

/** Production Access header only. Local sim never trusts a spoofable header. */
export function accessEmailHeader(request) {
  return normalizeEmail(request.headers.get(ACCESS_EMAIL_HEADER));
}

/**
 * Resolve the signed-in email for Access (production header or local cookie/env).
 * @param {Request} request
 * @param {{ kind: string, local?: boolean, sessionSecret?: string, defaultEmail?: string }} auth
 */
export async function resolveAccessEmail(request, auth) {
  if (auth.kind !== "access") return "";
  if (auth.local) {
    if (auth.sessionSecret) {
      const cookies = parseCookies(request.headers.get("Cookie"));
      const fromCookie = await verifyAccessEmailToken(
        auth.sessionSecret,
        cookies[AUTH_COOKIE_NAME],
      );
      if (fromCookie) return fromCookie;
    }
    return auth.defaultEmail || "";
  }
  return accessEmailHeader(request);
}

/** @deprecated Prefer resolveAccessEmail */
export function accessEmail(request) {
  return accessEmailHeader(request);
}

export async function isRequestAuthed(auth, request) {
  if (auth.kind === "access") {
    return Boolean(await resolveAccessEmail(request, auth));
  }
  const cookies = parseCookies(request.headers.get("Cookie"));
  const token = cookies[AUTH_COOKIE_NAME];
  return verifyPasswordToken(auth.password, token);
}

/** @deprecated Use resolveAuth */
export function resolveGate(env) {
  const auth = resolveAuth(env);
  if (auth.kind === "password") return { kind: "gated", password: auth.password };
  return { kind: "misconfigured" };
}

export function gateMisconfiguredResponse() {
  return authMisconfiguredResponse();
}

export async function createAuthToken(secret) {
  return createPasswordToken(secret);
}

export async function verifyAuthToken(secret, token) {
  return verifyPasswordToken(secret, token);
}
