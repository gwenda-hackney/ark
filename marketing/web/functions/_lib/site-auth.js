export const AUTH_COOKIE_NAME = "gwenda_access";
export const GATE_BYPASS_PARAM = "access";
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

/**
 * Shareable preview URL with ?access= so the recipient unlocks the gate.
 * Path must be same-origin (starts with a single /).
 */
export function buildGateShareUrl(origin, pathWithSearch, bypassKey) {
  const key = String(bypassKey || "").trim();
  const base = String(origin || "").trim().replace(/\/$/, "");
  if (!key || !base) return "";
  const path = safeRedirectPath(pathWithSearch || "/");
  const url = new URL(path, `${base}/`);
  url.searchParams.set(GATE_BYPASS_PARAM, key);
  return url.toString();
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

const AI_READING_BOTS =
  /gptbot|chatgpt-user|oai-searchbot|claudebot|anthropic-ai|google-extended|googleother|google-cloudvertexbot|bytespider|ccbot|meta-externalagent|amazonbot|applebot-extended|cloudflarebrowserrenderingcrawler|perplexitybot|cohere-ai|diffbot|youbot|ai2bot|phindbot|duckassistbot|petalbot|tiktokspider/i;

function getUserAgent(request) {
  const headers = request.headers;
  if (typeof headers?.get === "function") {
    return headers.get("User-Agent") ?? "";
  }
  return headers?.["user-agent"] ?? headers?.["User-Agent"] ?? "";
}

export function isSearchEngineCrawler(request) {
  return SEARCH_ENGINE_BOTS.test(getUserAgent(request));
}

export function isAiReadingBot(request) {
  return AI_READING_BOTS.test(getUserAgent(request));
}

/** Search, social preview, and AI reading bots bypass the preview password gate. */
export function isUnauthenticatedCrawler(request) {
  return isSearchEngineCrawler(request) || isAiReadingBot(request);
}

/** @returns {{ kind: "open" | "gated" | "misconfigured", password?: string }} */
export function resolveGate(env) {
  // A preview (SITE_PREVIEW, wrangler [env.preview.vars]) is always gated,
  // even though it runs as production.
  const preview = env.SITE_PREVIEW === "true";
  if (env.SITE_ENV === PRODUCTION_SITE_ENV && !preview) {
    return { kind: "open" };
  }

  const password = env.SITE_PASSWORD;

  if (preview && !password) {
    return { kind: "misconfigured" };
  }
  if (!password) {
    return { kind: "open" };
  }
  return { kind: "gated", password };
}

export function gateMisconfiguredResponse() {
  return new Response("The preview requires SITE_PASSWORD.", { status: 503 });
}

export function isPublicPath(pathname) {
  if (pathname === "/gate" || pathname === "/gate/") return true;
  if (pathname === "/thanks" || pathname === "/thanks/") return true;
  if (pathname === "/health" || pathname === "/health/") return true;
  // Deep health checks its own bearer secret (post-deploy smoke test).
  if (pathname === "/api/health/deep") return true;
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/"))
    return true;
  if (pathname === "/api/subscribe") return true;
  if (pathname === "/api/forms" || pathname.startsWith("/api/forms/"))
    return true;
  if (pathname === "/contact/verify" || pathname === "/contact/verify/")
    return true;
  if (pathname === "/forms/verify" || pathname === "/forms/verify/")
    return true;
  if (pathname === "/contact/edit" || pathname === "/contact/edit/")
    return true;
  if (pathname === "/forms/edit" || pathname === "/forms/edit/") return true;
  if (pathname === "/api/rsvp" || pathname.startsWith("/api/rsvp/"))
    return true;
  if (pathname === "/api/ticket" || pathname.startsWith("/api/ticket/"))
    return true;
  if (pathname === "/api/events" || pathname.startsWith("/api/events/"))
    return true;
  if (pathname === "/api/whats-on" || pathname.startsWith("/api/whats-on/"))
    return true;
  if (pathname === "/api/featured-artist") return true;
  if (pathname === "/whats-on" || pathname === "/whats-on/") return true;
  if (pathname.startsWith("/whats-on/")) return true;
  if (pathname === "/artists" || pathname === "/artists/") return true;
  if (pathname.startsWith("/artists/")) return true;
  if (pathname === "/invite" || pathname === "/invite/") return true;
  if (pathname.startsWith("/invite/")) return true;
  if (pathname === "/events/rsvp" || pathname === "/events/rsvp/") return true;
  if (pathname.startsWith("/events/")) return true;
  if (pathname === "/robots.txt") return true;
  if (pathname === "/sitemap.xml") return true;
  if (pathname === "/favicon.ico") return true;
  if (pathname === "/favicon.png") return true;
  if (pathname === "/apple-touch-icon.png") return true;
  if (pathname.startsWith("/brand/")) return true;
  if (pathname.startsWith("/og/")) return true;
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
