import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { opsWriteFeatures } from "./write-freeze-paths.js";
import { protect } from "../../functions/_middleware.js";
import { createTestD1 } from "../../../../shared/testing/d1-sqlite.js";
import { run } from "../../../../shared/d1.js";

describe("opsWriteFeatures", () => {
  it("maps each API path to the features it writes", () => {
    assert.deepEqual(opsWriteFeatures("/api/events/12/dates/2026-10-09"), [
      "events",
    ]);
    assert.deepEqual(opsWriteFeatures("/api/menu/4"), ["menu"]);
    assert.deepEqual(opsWriteFeatures("/api/inventory/lightspeed"), ["menu"]);
    assert.deepEqual(opsWriteFeatures("/api/suppliers"), ["menu"]);
    assert.deepEqual(opsWriteFeatures("/api/artists/3/images"), ["artists"]);
    assert.deepEqual(opsWriteFeatures("/api/users"), ["users"]);
    assert.deepEqual(opsWriteFeatures("/api/forms/9").sort(), [
      "artists",
      "events",
      "guests",
    ]);
    assert.deepEqual(opsWriteFeatures("/api/web/tick").sort(), [
      "events",
      "menu",
    ]);
  });

  it("never freezes config, sign-in or deploy status", () => {
    for (const path of [
      "/api/config",
      "/api/web/settings",
      "/api/auth/logout",
      "/api/web/deploy-status",
      "/api/eventsx",
    ]) {
      assert.deepEqual(opsWriteFeatures(path), [], path);
    }
  });
});

describe("ops middleware during a write freeze", () => {
  async function frozenEnv() {
    const OPS_DB = createTestD1("ops");
    await run(
      OPS_DB,
      "INSERT INTO _meta (key, value) VALUES ('write_freeze:events', 'now')",
    );
    return { OPS_DB, SITE_ENV: "dev" };
  }
  const context = (env, method, path) => ({
    env,
    request: new Request(`https://ops.test${path}`, { method }),
    data: {},
    next: async () => new Response("passed on"),
    waitUntil: () => {},
  });

  it("refuses writes to a frozen feature before anything else, the tick included", async () => {
    const env = await frozenEnv();
    for (const path of ["/api/events/1", "/api/web/tick"]) {
      const res = await protect(context(env, "POST", path));
      assert.equal(res.status, 423, path);
      assert.match((await res.json()).error, /read-only/);
    }
  });
});
