/** Synthetic origin for Cache API rate-limit keys (never fetched). */
const RATE_LIMIT_ORIGIN = "https://form-rate-limit.gwenda.internal";

export const FORM_RATE_LIMITS = {
  csrf: { bucket: "forms-csrf", limit: 60, windowSec: 15 * 60 },
  submit: { bucket: "forms-submit", limit: 8, windowSec: 15 * 60 },
  edit: { bucket: "forms-edit", limit: 30, windowSec: 15 * 60 },
};

export const FORM_RATE_LIMIT_ERROR = "Too many requests. Try again shortly.";

/**
 * Best-effort client IP for rate limiting.
 * Prefer Cloudflare's connecting IP; fall back to X-Forwarded-For.
 */
export function clientIp(request) {
  const cf = request?.headers?.get?.("CF-Connecting-IP")?.trim();
  if (cf) return cf;

  const forwarded = request?.headers?.get?.("X-Forwarded-For")?.trim();
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return "unknown";
}

function cacheKeyRequest(bucket, ip) {
  const safeIp = encodeURIComponent(String(ip || "unknown"));
  const safeBucket = encodeURIComponent(String(bucket || "default"));
  return new Request(`${RATE_LIMIT_ORIGIN}/${safeBucket}/${safeIp}`);
}

/**
 * In-memory Cache API shim for Node/vitest (and optional injection).
 */
export function createMemoryRateLimitCache() {
  /** @type {Map<string, { body: string, status: number, headers: Headers, expiresAt: number }>} */
  const store = new Map();

  return {
    async match(request) {
      const key = request instanceof Request ? request.url : String(request);
      const entry = store.get(key);
      if (!entry) return undefined;
      if (Date.now() >= entry.expiresAt) {
        store.delete(key);
        return undefined;
      }
      return new Response(entry.body, {
        status: entry.status,
        headers: entry.headers,
      });
    },
    async put(request, response) {
      const key = request instanceof Request ? request.url : String(request);
      const cacheControl = response.headers.get("Cache-Control") || "";
      const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
      const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 0;
      const body = await response.clone().text();
      store.set(key, {
        body,
        status: response.status,
        headers: new Headers(response.headers),
        expiresAt: Date.now() + Math.max(0, maxAgeSec) * 1000,
      });
    },
  };
}

function defaultCache() {
  try {
    if (typeof caches !== "undefined" && caches?.default) {
      return caches.default;
    }
  } catch {
    /* Node without Cache API */
  }
  return createMemoryRateLimitCache();
}

/**
 * Sliding fixed-window counter stored in Cache API.
 * @returns {Promise<{ ok: true } | { ok: false, retryAfterSec: number }>}
 */
export async function checkFormRateLimit(
  request,
  { bucket, limit, windowSec, cache, now = Date.now() } = {},
) {
  const max = Number(limit);
  const window = Number(windowSec);
  if (
    !bucket ||
    !Number.isFinite(max) ||
    max < 1 ||
    !Number.isFinite(window) ||
    window < 1
  ) {
    return { ok: true };
  }

  const ip = clientIp(request);
  const key = cacheKeyRequest(bucket, ip);
  const store = cache || defaultCache();

  let count = 0;
  let resetAt = now + window * 1000;

  const existing = await store.match(key);
  if (existing) {
    try {
      const data = await existing.json();
      const prevCount = Number(data?.count);
      const prevReset = Number(data?.resetAt);
      if (Number.isFinite(prevReset) && prevReset > now) {
        resetAt = prevReset;
        count = Number.isFinite(prevCount) ? prevCount : 0;
      }
    } catch {
      count = 0;
    }
  }

  count += 1;

  if (count > max) {
    const retryAfterSec = Math.max(1, Math.ceil((resetAt - now) / 1000));
    return { ok: false, retryAfterSec };
  }

  const ttlSec = Math.max(1, Math.ceil((resetAt - now) / 1000));
  await store.put(
    key,
    new Response(JSON.stringify({ count, resetAt }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `max-age=${ttlSec}`,
      },
    }),
  );

  return { ok: true };
}

/**
 * Standard 429 response for form APIs.
 */
export function formRateLimitResponse(retryAfterSec) {
  const retry = Math.max(1, Number(retryAfterSec) || 60);
  return new Response(JSON.stringify({ error: FORM_RATE_LIMIT_ERROR }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retry),
    },
  });
}
