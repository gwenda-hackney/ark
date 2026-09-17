import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { resetBaserowClientForTests } from "./baserow.js";
import {
  DEFAULT_POUR_TARGETS,
  getPourTargets,
  pourTargetsFromValues,
  resetConfigCacheForTests,
  setPourTargets,
  siteEnvName,
  valuesFromRows,
} from "./config-store.js";
import { jsonResponse, mockOpsBaserow } from "./test-baserow-mock.js";

afterEach(() => {
  mock.restoreAll();
  resetBaserowClientForTests();
  resetConfigCacheForTests();
});

const tableEnv = {
  BASEROW_API_KEY: "token",
  SITE_ENV: "staging",
};

describe("siteEnvName", () => {
  it("normalizes staging and local aliases", () => {
    assert.equal(siteEnvName({ SITE_ENV: "staging" }), "staging");
    assert.equal(siteEnvName({ PUBLIC_IS_STAGING: "true" }), "staging");
    assert.equal(siteEnvName({ SITE_ENV: "dev" }), "local");
    assert.equal(siteEnvName({}), "production");
  });
});

describe("valuesFromRows", () => {
  it("prefers env-specific rows over all", () => {
    const values = valuesFromRows(
      [
        { Name: "pour_target.cocktail", Value: "20", Env: "all", Service: "ops" },
        { Name: "pour_target.cocktail", Value: "22", Env: "staging", Service: "ops" },
        { Name: "other", Value: "x", Env: "production", Service: "ops" },
      ],
      "staging",
      "ops",
    );
    assert.equal(values["pour_target.cocktail"], "22");
    assert.equal(values.other, undefined);
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
  it("reads App Config rows for ops", async () => {
    mock.method(
      globalThis,
      "fetch",
      mockOpsBaserow(async (_input, _init, url) => {
        assert.match(url, /\/rows\/table\/88\//);
        return jsonResponse({
          results: [
            {
              id: 1,
              Name: "pour_target.cocktail",
              Value: "24",
              Env: "all",
              Service: "ops",
            },
          ],
        });
      }),
    );
    assert.deepEqual(await getPourTargets(tableEnv), {
      ...DEFAULT_POUR_TARGETS,
      cocktail: 24,
    });
  });

  it("returns defaults when the config table is missing", async () => {
    mock.method(globalThis, "fetch", async (input) => {
      const url = String(input);
      if (url.includes("/tables/all-tables/")) {
        return jsonResponse([
          { id: 1, name: "Menu Sections", database_id: 9 },
          { id: 2, name: "Menu Items", database_id: 9 },
          { id: 3, name: "Ingredients", database_id: 9 },
        ]);
      }
      return jsonResponse({ results: [] });
    });
    assert.deepEqual(await getPourTargets(tableEnv), DEFAULT_POUR_TARGETS);
  });
});

describe("applyOpsAppConfig", () => {
  it("fills missing plain settings from App Config", async () => {
    const { applyOpsAppConfig } = await import("./config-store.js");
    mock.method(
      globalThis,
      "fetch",
      mockOpsBaserow(async () =>
        jsonResponse({
          results: [
            {
              id: 1,
              Name: "sanity.project_id",
              Value: "pn5yjro6",
              Env: "all",
              Service: "ops",
            },
            {
              id: 2,
              Name: "google.oauth_client_id",
              Value: "client.apps.googleusercontent.com",
              Env: "all",
              Service: "ops",
            },
          ],
        }),
      ),
    );
    const env = await applyOpsAppConfig({ BASEROW_API_KEY: "token", SITE_ENV: "local" });
    assert.equal(env.SANITY_PROJECT_ID, "pn5yjro6");
    assert.equal(env.GOOGLE_OAUTH_CLIENT_ID, "client.apps.googleusercontent.com");
  });
});

describe("setPourTargets", () => {
  it("creates missing pour-target rows", async () => {
    const posts = [];
    mock.method(
      globalThis,
      "fetch",
      mockOpsBaserow(async (_input, init, url) => {
        if (url.includes("/rows/table/88/") && (!init.method || init.method === "GET")) {
          return jsonResponse({ results: [] });
        }
        if (init.method === "POST") {
          posts.push(JSON.parse(init.body));
          return jsonResponse({ id: posts.length, ...JSON.parse(init.body) }, 200);
        }
        throw new Error(`unexpected ${init.method} ${url}`);
      }),
    );
    const next = await setPourTargets(tableEnv, { cocktail: 21 });
    assert.equal(next.cocktail, 21);
    assert.equal(posts.length, 4);
    assert.equal(posts[0].Name, "pour_target.cocktail");
    assert.equal(posts[0].Value, "21");
    assert.equal(posts[0].Env, "all");
    assert.equal(posts[0].Service, "ops");
  });
});
