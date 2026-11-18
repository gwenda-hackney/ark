import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { memoryConfigRepository } from "../../../../shared/config-adapters/memory-config.js";
import {
  DEFAULT_POUR_TARGETS,
  applyOpsAppConfig,
  getPourTargets,
  pourTargetsFromValues,
  resetConfigCacheForTests,
  setPourTargets,
  siteEnvName,
} from "./config-store.js";

afterEach(() => {
  resetConfigCacheForTests();
});

/** A dev env whose config database holds these records. */
const envWith = (records = [], extra = {}) => ({
  SITE_ENV: "dev",
  configRepository: memoryConfigRepository(records),
  ...extra,
});

describe("siteEnvName", () => {
  it("normalizes local aliases", () => {
    assert.equal(siteEnvName({ SITE_ENV: "local" }), "dev");
    assert.equal(siteEnvName({ SITE_ENV: "dev" }), "dev");
    assert.throws(() => siteEnvName({}), /SITE_ENV is not set/);
  });
});

describe("pourTargetsFromValues", () => {
  it("fills defaults for missing keys", () => {
    assert.deepEqual(pourTargetsFromValues({}), DEFAULT_POUR_TARGETS);
    assert.deepEqual(
      pourTargetsFromValues({ "pour_target.cocktail": "24" }),
      { ...DEFAULT_POUR_TARGETS, cocktail: 24 },
    );
  });
});

describe("getPourTargets", () => {
  it("reads config records for ops, this env's over all", async () => {
    const env = envWith([
      { name: "pour_target.cocktail", value: "20", env: "all", service: "ops" },
      { name: "pour_target.cocktail", value: "24", env: "dev", service: "ops" },
      { name: "pour_target.beer", value: "30", env: "production", service: "ops" },
    ]);
    assert.deepEqual(await getPourTargets(env), {
      ...DEFAULT_POUR_TARGETS,
      cocktail: 24,
    });
  });

  it("returns defaults when the config database can't be reached", async () => {
    assert.deepEqual(await getPourTargets({ SITE_ENV: "local" }), DEFAULT_POUR_TARGETS);
  });
});

describe("applyOpsAppConfig", () => {
  it("fills missing plain settings from config", async () => {
    const env = await applyOpsAppConfig(
      envWith([
        { name: "sanity.project_id", value: "pn5yjro6", env: "all", service: "ops" },
        { name: "google.oauth_client_id", value: "client.apps.googleusercontent.com", env: "all", service: "ops" },
      ]),
    );
    assert.equal(env.SANITY_PROJECT_ID, "pn5yjro6");
    assert.equal(env.GOOGLE_OAUTH_CLIENT_ID, "client.apps.googleusercontent.com");
  });
});

describe("setPourTargets", () => {
  it("creates this env's pour-target records, never Env=all", async () => {
    const env = envWith();
    const next = await setPourTargets(env, { cocktail: 21 });
    assert.equal(next.cocktail, 21);
    const records = await env.configRepository.list();
    assert.equal(records.length, 4);
    const cocktail = records.find((r) => r.name === "pour_target.cocktail");
    assert.equal(cocktail.value, "21");
    assert.equal(cocktail.env, "dev");
    assert.equal(cocktail.service, "ops");
  });
});
