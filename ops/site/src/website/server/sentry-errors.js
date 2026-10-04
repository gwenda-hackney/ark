/**
 * Unresolved Sentry issues from the last 24 hours, for the dashboard's
 * Website errors card. Read with SENTRY_READ_TOKEN (Issue & Event: Read only);
 * the browser never talks to Sentry.
 *
 * Sentry's API is slow and rate limited, so answers are kept for CACHE_SECONDS:
 * in this isolate's memory, and in Cloudflare's cache for the other isolates.
 * Each ops environment has its own entry.
 */
import { environmentOf } from "../../../../../shared/config.js";

export const SENTRY_API = "https://de.sentry.io/api/0";
export const SENTRY_ORG = "gwenda";
export const CACHE_SECONDS = 300;
const PERIOD = "24h";
const LIMIT = 100;
const TOP = 5;
/** Sentry's own labels for an issue that is new, or back after being fixed. */
const NEW_SUBSTATUS = new Set(["new", "regressed", "escalating"]);
const DAY_MS = 24 * 60 * 60 * 1000;

const memory = new Map();

export function resetSentryCacheForTests() {
  memory.clear();
}

function cacheKey(env) {
  let name = "unknown";
  try {
    name = environmentOf(env);
  } catch {
    // No SITE_ENV: still answer, under a key of its own.
  }
  return `https://ops-cache.gwenda.internal/sentry-errors/${name}`;
}

export function issuesUrl() {
  const params = new URLSearchParams({
    statsPeriod: PERIOD,
    query: "is:unresolved",
    sort: "freq",
    limit: String(LIMIT),
    // Every project in the organisation, not only the token owner's.
    project: "-1",
  });
  return `${SENTRY_API}/organizations/${SENTRY_ORG}/issues/?${params}`;
}

function isNew(issue, now) {
  if (NEW_SUBSTATUS.has(String(issue?.substatus || ""))) return true;
  const first = Date.parse(issue?.firstSeen || "");
  return Number.isFinite(first) && now - first < DAY_MS;
}

/** Sentry's issue list, down to what the card shows. */
export function summarizeIssues(issues, now = Date.now()) {
  const list = Array.isArray(issues) ? issues : [];
  const rows = list.map((issue) => ({
    id: String(issue.id || ""),
    shortId: String(issue.shortId || ""),
    title: String(issue.title || issue.culprit || "Error"),
    project: String(issue.project?.slug || ""),
    count: Number(issue.count) || 0,
    lastSeen: issue.lastSeen || null,
    firstSeen: issue.firstSeen || null,
    link: String(issue.permalink || ""),
    isNew: isNew(issue, now),
  }));
  const top = [...rows].sort((a, b) => b.count - a.count || String(b.lastSeen).localeCompare(String(a.lastSeen)));
  return {
    configured: true,
    period: PERIOD,
    total: rows.length,
    capped: rows.length >= LIMIT,
    events: rows.reduce((sum, row) => sum + row.count, 0),
    newCount: rows.filter((row) => row.isNew).length,
    issues: top.slice(0, TOP),
    checkedAt: new Date(now).toISOString(),
  };
}

async function fromSentry(token, fetchImpl, now) {
  const response = await fetchImpl(issuesUrl(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const error = new Error(
      response.status === 401 || response.status === 403
        ? "Sentry refused the read token. It may have been revoked."
        : `Sentry answered ${response.status}.`,
    );
    error.status = 502;
    throw error;
  }
  return summarizeIssues(await response.json(), now);
}

function defaultCache() {
  return typeof caches !== "undefined" && caches?.default ? caches.default : null;
}

/**
 * The card's data, or `{ configured: false }` without a token.
 * `deps`: fetchImpl, cache (a Cache API cache, or null), now.
 */
export async function sentryErrors(env, deps = {}) {
  const token = String(env?.SENTRY_READ_TOKEN || "").trim();
  if (!token) return { configured: false };
  const fetchImpl = deps.fetchImpl || fetch;
  const cache = deps.cache === undefined ? defaultCache() : deps.cache;
  const now = deps.now ?? Date.now();
  const key = cacheKey(env);

  const held = memory.get(key);
  if (held && held.token === token && now - held.at < CACHE_SECONDS * 1000) return held.data;

  if (cache) {
    const hit = await cache.match(key).catch(() => null);
    if (hit) {
      const data = await hit.json().catch(() => null);
      if (data?.configured) {
        memory.set(key, { token, at: Date.parse(data.checkedAt) || now, data });
        return data;
      }
    }
  }

  const data = await fromSentry(token, fetchImpl, now);
  memory.set(key, { token, at: now, data });
  if (cache) {
    const response = new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${CACHE_SECONDS}` },
    });
    await cache.put(key, response).catch(() => {});
  }
  return data;
}
