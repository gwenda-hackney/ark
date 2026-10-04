import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
  CACHE_SECONDS,
  issuesUrl,
  resetSentryCacheForTests,
  sentryErrors,
  summarizeIssues,
} from "./sentry-errors.js";
import { onRequestGet } from "../../../functions/api/health/errors.js";

const NOW = Date.parse("2026-10-03T17:00:00Z");

function issue(overrides = {}) {
  return {
    id: "101",
    shortId: "OPS-1",
    title: "TypeError: x is undefined",
    culprit: "dashboard.js",
    project: { slug: "ops" },
    count: "4",
    lastSeen: "2026-10-03T16:50:00Z",
    firstSeen: "2026-09-01T10:00:00Z",
    permalink: "https://gwenda.sentry.io/issues/101/",
    substatus: "ongoing",
    ...overrides,
  };
}

/** A Cache API stand-in. */
function memoryCache() {
  const store = new Map();
  return {
    store,
    async match(key) {
      const hit = store.get(key);
      return hit ? new Response(hit) : undefined;
    },
    async put(key, response) {
      store.set(key, await response.text());
    },
  };
}

function sentryFetch(body, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

beforeEach(() => resetSentryCacheForTests());

describe("summarizeIssues", () => {
  it("maps Sentry's fields, top five by count, and counts new ones", () => {
    const issues = [
      issue({ id: "1", count: "2" }),
      issue({ id: "2", count: "50", substatus: "regressed" }),
      issue({ id: "3", count: "7", firstSeen: "2026-10-03T12:00:00Z" }),
      issue({ id: "4", count: "1" }),
      issue({ id: "5", count: "3" }),
      issue({ id: "6", count: "9" }),
    ];
    const out = summarizeIssues(issues, NOW);
    assert.equal(out.configured, true);
    assert.equal(out.total, 6);
    assert.equal(out.events, 72);
    assert.equal(out.newCount, 2);
    assert.deepEqual(out.issues.map((row) => row.id), ["2", "6", "3", "5", "1"]);
    assert.deepEqual(out.issues[0], {
      id: "2",
      shortId: "OPS-1",
      title: "TypeError: x is undefined",
      project: "ops",
      count: 50,
      lastSeen: "2026-10-03T16:50:00Z",
      firstSeen: "2026-09-01T10:00:00Z",
      link: "https://gwenda.sentry.io/issues/101/",
      isNew: true,
    });
    assert.equal(out.checkedAt, new Date(NOW).toISOString());
  });

  it("asks for unresolved issues across every project in the last day", () => {
    const url = new URL(issuesUrl());
    assert.equal(url.host, "de.sentry.io");
    assert.equal(url.pathname, "/api/0/organizations/gwenda/issues/");
    assert.equal(url.searchParams.get("statsPeriod"), "24h");
    assert.equal(url.searchParams.get("query"), "is:unresolved");
    assert.equal(url.searchParams.get("project"), "-1");
  });
});

describe("sentryErrors", () => {
  it("says not set up without a token, and never calls Sentry", async () => {
    const fetchImpl = sentryFetch([]);
    assert.deepEqual(await sentryErrors({ SITE_ENV: "dev" }, { fetchImpl, cache: null }), { configured: false });
    assert.deepEqual(await sentryErrors({ SITE_ENV: "dev", SENTRY_READ_TOKEN: "  " }, { fetchImpl, cache: null }), {
      configured: false,
    });
    assert.equal(fetchImpl.mock.calls.length, 0);
  });

  it("sends the read token and caches the answer for five minutes", async () => {
    const env = { SITE_ENV: "dev", SENTRY_READ_TOKEN: "read-token" };
    const fetchImpl = sentryFetch([issue()]);
    const cache = memoryCache();

    const first = await sentryErrors(env, { fetchImpl, cache, now: NOW });
    assert.equal(first.total, 1);
    assert.equal(fetchImpl.mock.calls.length, 1);
    assert.equal(fetchImpl.mock.calls[0][1].headers.Authorization, "Bearer read-token");
    assert.equal(cache.store.size, 1);

    await sentryErrors(env, { fetchImpl, cache, now: NOW + 60_000 });
    assert.equal(fetchImpl.mock.calls.length, 1, "served from memory");

    // Another isolate: empty memory, warm Cloudflare cache.
    resetSentryCacheForTests();
    const fromCache = await sentryErrors(env, { fetchImpl, cache, now: NOW + 120_000 });
    assert.equal(fromCache.total, 1);
    assert.equal(fetchImpl.mock.calls.length, 1, "served from the cache");

    // Past the memory window with the cache expired (Cloudflare drops it).
    cache.store.clear();
    await sentryErrors(env, { fetchImpl, cache, now: NOW + CACHE_SECONDS * 1000 + 1 });
    assert.equal(fetchImpl.mock.calls.length, 2);
  });

  it("keeps production and dev apart", async () => {
    const cache = memoryCache();
    await sentryErrors({ SITE_ENV: "dev", SENTRY_READ_TOKEN: "t" }, { fetchImpl: sentryFetch([]), cache, now: NOW });
    await sentryErrors(
      { SITE_ENV: "production", SENTRY_READ_TOKEN: "t" },
      { fetchImpl: sentryFetch([issue()]), cache, now: NOW },
    );
    assert.equal(cache.store.size, 2);
  });

  it("says plainly when Sentry refuses the token", async () => {
    await assert.rejects(
      sentryErrors({ SITE_ENV: "dev", SENTRY_READ_TOKEN: "old" }, { fetchImpl: sentryFetch({ detail: "no" }, 401), cache: null }),
      (error) => error.status === 502 && /refused the read token/.test(error.message),
    );
  });
});

describe("GET /api/health/errors", () => {
  let realFetch;
  beforeEach(() => {
    realFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("answers not set up without the token", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("no outside calls");
    });
    const response = await onRequestGet({
      request: new Request("https://gwenda-ops-dev.pages.dev/api/health/errors"),
      env: { SITE_ENV: "dev", BASEROW_CONFIG_API_KEY: "" },
      params: {},
      data: { opsEnv: { SITE_ENV: "dev" } },
      waitUntil() {},
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { configured: false });
  });
});
