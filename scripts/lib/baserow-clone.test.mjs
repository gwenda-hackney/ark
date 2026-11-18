import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { baserowRequest, retryDelayMs } from "./baserow-clone.mjs";

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

describe("baserowRequest", () => {
  it("waits out throttling, honouring Retry-After, then returns the answer", async () => {
    const answers = [
      json({ detail: "Request was throttled." }, 429, { "Retry-After": "3" }),
      json({ detail: "busy" }, 503),
      json({ ok: true }),
    ];
    const waits = [];
    const result = await baserowRequest(
      "https://b",
      "JWT",
      "t",
      "/api/x/",
      {},
      {
        fetchImpl: async () => answers.shift(),
        wait: async (ms) => waits.push(ms),
      },
    );
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(waits, [3000, 2000]);
  });

  it("gives up after its attempts and names the request", async () => {
    let calls = 0;
    await assert.rejects(
      baserowRequest(
        "https://b",
        "Token",
        "t",
        "/api/rows/",
        { method: "POST" },
        {
          fetchImpl: async () => (
            calls++,
            json({ detail: "Request was throttled." }, 429)
          ),
          wait: async () => {},
        },
      ),
      /POST \/api\/rows\/ → 429: Request was throttled\./,
    );
    assert.equal(calls, 7);
  });

  it("does not retry a real error", async () => {
    let calls = 0;
    await assert.rejects(
      baserowRequest(
        "https://b",
        "JWT",
        "t",
        "/api/x/",
        {},
        {
          fetchImpl: async () => (
            calls++,
            json({ detail: "no such table" }, 404)
          ),
          wait: async () => {},
        },
      ),
      /404: no such table/,
    );
    assert.equal(calls, 1);
  });

  it("backs off 1s, 2s, 4s… up to a minute without Retry-After", () => {
    const res = new Response(null, { status: 429 });
    assert.deepEqual(
      [1, 2, 3, 8].map((n) => retryDelayMs(res, n)),
      [1000, 2000, 4000, 60000],
    );
  });
});
