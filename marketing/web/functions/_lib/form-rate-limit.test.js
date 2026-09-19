import { describe, expect, it } from "vitest";
import {
  FORM_RATE_LIMIT_ERROR,
  checkFormRateLimit,
  clientIp,
  createMemoryRateLimitCache,
  formRateLimitResponse,
} from "./form-rate-limit.js";

function req(headers = {}) {
  return new Request("https://gwenda.co.uk/api/forms", {
    headers,
  });
}

describe("clientIp", () => {
  it("prefers CF-Connecting-IP", () => {
    expect(
      clientIp(
        req({
          "CF-Connecting-IP": "203.0.113.9",
          "X-Forwarded-For": "198.51.100.1, 203.0.113.9",
        }),
      ),
    ).toBe("203.0.113.9");
  });

  it("uses the first X-Forwarded-For hop", () => {
    expect(
      clientIp(req({ "X-Forwarded-For": "198.51.100.1, 203.0.113.9" })),
    ).toBe("198.51.100.1");
  });

  it("falls back to unknown", () => {
    expect(clientIp(req())).toBe("unknown");
  });
});

describe("checkFormRateLimit", () => {
  it("allows requests under the limit", async () => {
    const cache = createMemoryRateLimitCache();
    const request = req({ "CF-Connecting-IP": "203.0.113.10" });

    for (let i = 0; i < 3; i += 1) {
      const result = await checkFormRateLimit(request, {
        bucket: "test-under",
        limit: 3,
        windowSec: 60,
        cache,
      });
      expect(result).toEqual({ ok: true });
    }
  });

  it("trips on the request after the limit", async () => {
    const cache = createMemoryRateLimitCache();
    const request = req({ "CF-Connecting-IP": "203.0.113.11" });
    const opts = {
      bucket: "test-trip",
      limit: 2,
      windowSec: 60,
      cache,
    };

    expect(await checkFormRateLimit(request, opts)).toEqual({ ok: true });
    expect(await checkFormRateLimit(request, opts)).toEqual({ ok: true });

    const blocked = await checkFormRateLimit(request, opts);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("resets after the window", async () => {
    const cache = createMemoryRateLimitCache();
    const request = req({ "CF-Connecting-IP": "203.0.113.12" });
    const base = {
      bucket: "test-reset",
      limit: 1,
      windowSec: 60,
      cache,
    };

    expect(
      await checkFormRateLimit(request, { ...base, now: 1_000_000 }),
    ).toEqual({ ok: true });
    expect(
      (await checkFormRateLimit(request, { ...base, now: 1_000_000 })).ok,
    ).toBe(false);

    expect(
      await checkFormRateLimit(request, {
        ...base,
        now: 1_000_000 + 60_000 + 1,
      }),
    ).toEqual({ ok: true });
  });

  it("tracks IPs separately", async () => {
    const cache = createMemoryRateLimitCache();
    const opts = {
      bucket: "test-ips",
      limit: 1,
      windowSec: 60,
      cache,
    };

    expect(
      await checkFormRateLimit(req({ "CF-Connecting-IP": "1.1.1.1" }), opts),
    ).toEqual({ ok: true });
    expect(
      await checkFormRateLimit(req({ "CF-Connecting-IP": "2.2.2.2" }), opts),
    ).toEqual({ ok: true });
    expect(
      (await checkFormRateLimit(req({ "CF-Connecting-IP": "1.1.1.1" }), opts))
        .ok,
    ).toBe(false);
  });
});

describe("formRateLimitResponse", () => {
  it("returns 429 with Retry-After", async () => {
    const res = formRateLimitResponse(42);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    const body = await res.json();
    expect(body).toEqual({ error: FORM_RATE_LIMIT_ERROR });
  });
});
