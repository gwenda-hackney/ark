import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { jsonResponse, withApiHandler } from "./http.js";
import { createLogger } from "./log.js";

function capturingLog() {
  const records = [];
  const log = createLogger({
    write: (record) => records.push(record),
    fields: { path: "/api/menu" },
  });
  return { log, records };
}

describe("withApiHandler", () => {
  it("returns handler responses and logs the request", async () => {
    const { log, records } = capturingLog();
    const handler = withApiHandler(async () => jsonResponse({ ok: true }));
    const response = await handler({
      log,
      request: new Request("http://localhost/api/menu"),
    });
    assert.equal(response.status, 200);
    await assert.deepEqual(await response.json(), { ok: true });
    assert.equal(records.length, 1);
    assert.equal(records[0].level, "info");
    assert.equal(records[0].message, "api.request");
    assert.equal(records[0].status, 200);
    assert.equal(typeof records[0].ms, "number");
  });

  it("returns JSON 500 and logs thrown errors", async () => {
    const { log, records } = capturingLog();
    const handler = withApiHandler(async () => {
      throw new Error("boom");
    });
    const response = await handler({
      log,
      request: new Request("http://localhost/api/menu"),
    });
    assert.equal(response.status, 500);
    await assert.deepEqual(await response.json(), {
      error: "Something went wrong. Please try again.",
    });
    assert.equal(records[0].level, "error");
    assert.equal(records[0].message, "api.error");
    assert.equal(records[0].status, 500);
    assert.equal(records[0].err.message, "boom");
  });

  it("passes through 4xx status from thrown errors", async () => {
    const { log, records } = capturingLog();
    const handler = withApiHandler(async () => {
      const error = new Error("Baserow 429: Request was throttled.");
      error.status = 429;
      throw error;
    });
    const response = await handler({
      log,
      request: new Request("http://localhost/api/inventory"),
    });
    assert.equal(response.status, 429);
    await assert.deepEqual(await response.json(), {
      error: "Baserow 429: Request was throttled.",
    });
    assert.equal(records[0].err.status, 429);
  });
});
