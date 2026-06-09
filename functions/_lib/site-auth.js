export const AUTH_COOKIE_NAME = "gwenda_access";
export const GATE_BYPASS_PARAM = "access";
export const STAGING_SITE_ENV = "staging";
export const PRODUCTION_SITE_ENV = "production";
const AUTH_SCOPE = "gwenda-gate-v1";
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30;

function bufferToBase64Url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signToken(secret) {
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
    new TextEncoder().encode(AUTH_SCOPE),
  );
  return bufferToBase64Url(sig);
}

export async function createAuthToken(secret) {
  return signToken(secret);
}

export async function verifyAuthToken(secret, token) {
  if (!token || !secret) return false;
  const expected = await createAuthToken(secret);
  return matchesSecret(token, expected);
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

export function gateBypassRedirectPath(url) {
  const clean = new URL(url);
  if (!clean.searchParams.has(GATE_BYPASS_PARAM)) return null;
  clean.searchParams.delete(GATE_BYPASS_PARAM);

  if (clean.pathname === "/gate" || clean.pathname === "/gate/") {
    return safeRedirectPath(clean.searchParams.get("next"));
  }

  const search = clean.searchParams.toString();
  return clean.pathname + (search ? `?${search}` : "");
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

export function buildAuthCookie(token, { secure = true } = {}) {
  const parts = [
    `${AUTH_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${COOKIE_MAX_AGE_SEC}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

const SEARCH_ENGINE_BOTS =
  /googlebot|google-inspectiontool|storebot-google|bingbot|slurp|duckduckbot|baiduspider|yandexbot|applebot|facebookexternalhit|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|microsoft office|ms-office|skypeuripreview|teams|opengraphxyzbot|iframely|embedly|preview/i;

export function isSearchEngineCrawler(request) {
  const ua = request.headers.get("User-Agent") ?? "";
  return SEARCH_ENGINE_BOTS.test(ua);
}

/** @returns {{ kind: "open" | "gated" | "misconfigured", password?: string }} */
export function resolveGate(env) {
  if (env.SITE_ENV === PRODUCTION_SITE_ENV) {
    return { kind: "open" };
  }

  const stagingRequired = env.SITE_ENV === STAGING_SITE_ENV;
  const password = env.SITE_PASSWORD;

  if (stagingRequired && !password) {
    return { kind: "misconfigured" };
  }
  if (!password) {
    return { kind: "open" };
  }
  return { kind: "gated", password };
}

export function gateMisconfiguredResponse() {
  return new Response("Staging requires SITE_PASSWORD.", { status: 503 });
}

export function isPublicPath(pathname) {
  if (pathname === "/gate" || pathname === "/gate/") return true;
  if (pathname === "/thanks" || pathname === "/thanks/") return true;
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) return true;
  if (pathname === "/api/subscribe") return true;
  if (pathname === "/og-image.jpg" || pathname === "/robots.txt") return true;
  if (pathname === "/sitemap.xml") return true;
  if (pathname.startsWith("/_astro/")) return true;
  if (pathname.startsWith("/_image")) return true;
  if (pathname.startsWith("/@")) return true;
  return false;
}

export function safeRedirectPath(next) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  if (next.startsWith("/gate")) return "/";
  return next;
}
