import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { getSetting, resetConfigCacheForTests } from "../../shared/config.js";
import { createTestD1 } from "../../shared/testing/d1-sqlite.js";
import { parseArgs, settingRow } from "../config-set.mjs";

const KEY = "website.auto_update";

async function configDb() {
  return createTestD1("config");
}

describe("config:set", () => {
  it("takes an environment and a known setting; a value is optional and may be empty", () => {
    assert.deepEqual(parseArgs(["--env", "production", "--key", KEY]), { env: "production", key: KEY, value: undefined });
    assert.deepEqual(parseArgs(["--env", "dev", "--key", KEY, "--value", ""]), { env: "dev", key: KEY, value: "" });
    assert.throws(() => parseArgs(["--env", "staging", "--key", KEY]), /--env must be/);
    assert.throws(() => parseArgs(["--env", "dev", "--key", "website.auto_updat", "--value", "off"]), /--key must be a setting/);
    assert.throws(() => parseArgs(["--env", "dev", "--key", KEY, "--value"]), /--value needs/);
  });

  it("turns website.auto_update off for one environment, as ops then reads it, and back", async () => {
    const db = await configDb();
    assert.deepEqual(await settingRow(db, { env: "production", key: KEY }), { before: null, after: null });
    assert.deepEqual(await settingRow(db, { env: "production", key: KEY, value: "off" }), { before: null, after: "off" });

    const reads = async (SITE_ENV) => {
      resetConfigCacheForTests();
      return getSetting({ SITE_ENV, CONFIG_DB: db }, "ops", KEY);
    };
    assert.equal(await reads("production"), "off");
    assert.equal(await reads("dev"), "", "dev has its own row");

    assert.deepEqual(await settingRow(db, { env: "production", key: KEY, value: "" }), { before: "off", after: "" });
    assert.equal(await reads("production"), "");
  });
});
