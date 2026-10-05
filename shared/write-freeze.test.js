import assert from "node:assert/strict";
import { describe, it, vi } from "vitest";
import { run } from "./d1.js";
import { createTestD1 } from "./testing/d1-sqlite.js";
import {
  FREEZE_KEY_PREFIX,
  FROZEN_STATUS,
  featuresForPath,
  frozenFeatures,
  frozenWriteResponse,
  isWriteRequest,
} from "./write-freeze.js";

async function freeze(db, feature) {
  await run(db, "INSERT INTO _meta (key, value) VALUES (?, ?)", [
    FREEZE_KEY_PREFIX + feature,
    "2026-10-05T10:00:00Z",
  ]);
}

describe("frozenFeatures", () => {
  it("reads each feature's flag from the database it moves into", async () => {
    const env = {
      OPS_DB: createTestD1("ops"),
      WEBSITE_DB: createTestD1("website"),
    };
    assert.deepEqual(await frozenFeatures(env), []);
    await freeze(env.OPS_DB, "events");
    await freeze(env.WEBSITE_DB, "guests");
    assert.deepEqual((await frozenFeatures(env)).sort(), ["events", "guests"]);
    assert.deepEqual(await frozenFeatures(env, ["menu", "guests"]), ["guests"]);
  });

  it("ignores a flag with no value, and features this runtime has no database for", async () => {
    const env = { WEBSITE_DB: createTestD1("website") };
    await run(env.WEBSITE_DB, "INSERT INTO _meta (key, value) VALUES (?, '')", [
      FREEZE_KEY_PREFIX + "guests",
    ]);
    assert.deepEqual(await frozenFeatures(env), []);
    assert.deepEqual(await frozenFeatures({}, ["events"]), []);
  });

  it("fails open when the database can't be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = {
      prepare: () => ({
        bind: () => ({ all: async () => Promise.reject(new Error("D1 down")) }),
      }),
    };
    assert.deepEqual(await frozenFeatures({ OPS_DB: broken }, ["events"]), []);
    assert.equal(error.mock.calls.length, 1);
    error.mockRestore();
  });

  it("treats a database without _meta yet as not frozen, quietly", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    assert.deepEqual(
      await frozenFeatures({ OPS_DB: createTestD1(null) }, ["events"]),
      [],
    );
    assert.equal(error.mock.calls.length, 0);
    error.mockRestore();
  });

  it("refuses unknown features", async () => {
    await assert.rejects(frozenFeatures({}, ["config"]), /Unknown feature/);
  });
});

describe("frozenWriteResponse", () => {
  it("answers 423 with a plain message, and nothing when not frozen", async () => {
    const env = { OPS_DB: createTestD1("ops") };
    assert.equal(await frozenWriteResponse(env, ["events"]), null);
    assert.equal(await frozenWriteResponse(env, []), null);
    await freeze(env.OPS_DB, "events");
    const res = await frozenWriteResponse(env, ["events", "menu"]);
    assert.equal(res.status, FROZEN_STATUS);
    assert.equal(res.headers.get("Retry-After"), "120");
    const body = await res.json();
    assert.deepEqual(body.frozen, ["events"]);
    assert.match(body.error, /read-only for a few minutes/);
  });
});

describe("helpers", () => {
  it("knows which requests write", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "delete"])
      assert.ok(isWriteRequest({ method }));
    for (const method of ["GET", "HEAD", "OPTIONS"])
      assert.ok(!isWriteRequest({ method }));
  });

  it("collects the features a path writes, without repeats", () => {
    const table = [
      [/^\/api\/a/, ["events"]],
      [/^\/api\/a\/b/, ["events", "menu"]],
    ];
    assert.deepEqual(featuresForPath("/api/a/b", table), ["events", "menu"]);
    assert.deepEqual(featuresForPath("/api/z", table), []);
  });
});
