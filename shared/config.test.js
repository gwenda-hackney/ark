import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  LOCAL_PLACEHOLDER,
  getSetting,
  getSettings,
  missingLocalSettings,
  resetConfigCacheForTests,
  websiteUrls,
} from "./config.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function withRows(rows, run) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/all-tables/")) {
      return new Response(JSON.stringify([{ id: 5, name: "Config", database_id: 1 }]));
    }
    return new Response(JSON.stringify({ results: rows, next: null }));
  };
  resetConfigCacheForTests();
  return Promise.resolve(run()).finally(() => {
    globalThis.fetch = original;
    resetConfigCacheForTests();
  });
}

const row = (Name, Value, Env, Service) => ({ Name, Value, Env: { value: Env }, Service: { value: Service } });
const ROWS = [
  row("forms.notify_email", "alerts@gwenda.co.uk", "dev", "web"),
  row("sanity.project_id", "pn5yjro6", "all", "all"),
  row("sanity.project_id", "gwscpagy", "dev", "all"),
];

describe("config service", () => {
  it("all code reads config through shared/config.js", () => {
    const hits = execFileSync(
      "git",
      ["grep", "-l", "config-db.js", "--", "*.js", "*.mjs", "*.ts", "*.svelte", "*.astro"],
      { cwd: ROOT, encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean)
      .filter(
        (file) =>
          ![
            "shared/config.js",
            "shared/site-urls.js",
            "shared/config-db.test.js",
            "shared/config.test.js",
          ].includes(file),
      );
    assert.deepEqual(hits, []);
  });

  it("a developer's machine reads dev rows, with their own value on top", () =>
    withRows(ROWS, async () => {
      const machine = { SITE_ENV: "local", BASEROW_CONFIG_API_KEY: "k", FORMS_NOTIFY_EMAIL: "me@x.co" };
      assert.equal(await getSetting(machine, "web", "forms.notify_email"), "me@x.co");
      assert.equal(await getSetting(machine, "ops", "sanity.project_id"), "gwscpagy");
      const hosted = { SITE_ENV: "dev", BASEROW_CONFIG_API_KEY: "k", FORMS_NOTIFY_EMAIL: "me@x.co" };
      // Hosted dev never takes a developer's local value.
      assert.equal(await getSetting(hosted, "web", "forms.notify_email"), "alerts@gwenda.co.uk");
    }));

  it("a required local value left as the placeholder fails loudly", () =>
    withRows(ROWS, async () => {
      const machine = { SITE_ENV: "local", BASEROW_CONFIG_API_KEY: "k", FORMS_NOTIFY_EMAIL: LOCAL_PLACEHOLDER };
      await assert.rejects(getSetting(machine, "web", "forms.notify_email"), /FORMS_NOTIFY_EMAIL is not set/);
      assert.deepEqual(
        missingLocalSettings(machine).map((m) => m.env),
        ["FORMS_NOTIFY_EMAIL"],
      );
      assert.deepEqual(missingLocalSettings({ SITE_ENV: "dev" }), []);
    }));

  it("web.origin is worked out from the environment, never stored", () =>
    withRows([...ROWS, row("web.origin", "https://evil.example", "all", "ops")], async () => {
      assert.equal(await getSetting({ SITE_ENV: "production" }, "ops", "web.origin"), "https://gwenda.co.uk");
      assert.equal(await getSetting({ SITE_ENV: "dev" }, "ops", "web.origin"), "https://gwenda-web-dev.pages.dev");
      assert.equal(await getSetting({ SITE_ENV: "local" }, "ops", "web.origin"), "http://localhost:4321");
      const all = await getSettings({ SITE_ENV: "production", BASEROW_CONFIG_API_KEY: "k" }, "ops");
      assert.equal(all["web.origin"], "https://gwenda.co.uk");
      assert.equal(websiteUrls({ SITE_ENV: "staging" }).live, "https://gwenda-staging.pages.dev");
    }));
});
