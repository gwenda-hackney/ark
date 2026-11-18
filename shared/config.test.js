import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { describe, it } from "vitest";
import { fileURLToPath } from "node:url";
import { memoryConfigRepository } from "./config-adapters/memory-config.js";
import {
  LOCAL_PLACEHOLDER,
  describeSettings,
  getSetting,
  getSettingOrEmpty,
  missingLocalSettings,
  removeRetiredEnv,
} from "./config.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** An env whose config database holds these records. */
const withRecords = (records, env) => ({ ...env, configRepository: memoryConfigRepository(records) });

const row = (name, value, env, service) => ({ name, value, env, service });
const ROWS = [
  row("forms.notify_email", "alerts@gwenda.co.uk", "dev", "web"),
  row("sanity.project_id", "pn5yjro6", "all", "all"),
  row("sanity.project_id", "gwscpagy", "dev", "all"),
];

describe("config service", () => {
  // Only shared/config.js opens the config repository; everything else asks it.
  it("all code reads config through shared/config.js", () => {
    const hits = execFileSync(
      "git",
      ["grep", "-l", "config-repository.js", "--", "*.js", "*.mjs", "*.ts", "*.svelte", "*.astro"],
      { cwd: ROOT, encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean)
      .filter(
        (file) =>
          !["shared/config.js", "shared/config-repository.contract.test.js", "shared/config.test.js"].includes(file),
      );
    assert.deepEqual(hits, []);
  });

  it("a developer's machine reads dev rows, with their own value on top", async () => {
    const machine = withRecords(ROWS, { SITE_ENV: "local", FORMS_NOTIFY_EMAIL: "me@x.co" });
    assert.equal(await getSetting(machine, "web", "forms.notify_email"), "me@x.co");
    assert.equal(await getSetting(machine, "ops", "sanity.project_id"), "gwscpagy");
    const hosted = withRecords(ROWS, { SITE_ENV: "dev", FORMS_NOTIFY_EMAIL: "me@x.co" });
    // Hosted dev never takes a developer's local value.
    assert.equal(await getSetting(hosted, "web", "forms.notify_email"), "alerts@gwenda.co.uk");
  });

  it("the settings overview shows only the environment's own database", async () => {
    const env = withRecords(
      [row("sanity.project_id", "pn5yjro6", "all", "all"), row("google.calendar_id", "prod-cal", "production", "ops")],
      { SITE_ENV: "production" },
    );
    const overview = await describeSettings(env);
    assert.deepEqual(overview.environments, ["production"]);
    const calendar = overview.settings.find((s) => s.key === "google.calendar_id");
    assert.deepEqual(calendar.values, { production: { value: "prod-cal", from: "config: production" } });
  });

  it("a required local value left as the placeholder fails loudly", async () => {
    const machine = withRecords(ROWS, { SITE_ENV: "local", FORMS_NOTIFY_EMAIL: LOCAL_PLACEHOLDER });
    await assert.rejects(getSetting(machine, "web", "forms.notify_email"), /FORMS_NOTIFY_EMAIL is not set/);
    assert.deepEqual(
      missingLocalSettings(machine).map((m) => m.env),
      ["FORMS_NOTIFY_EMAIL"],
    );
    assert.deepEqual(missingLocalSettings({ SITE_ENV: "dev" }), []);
  });

  it("an unreachable config database reads as empty where callers have a default", async () => {
    assert.equal(await getSettingOrEmpty({ SITE_ENV: "dev" }, "ops", "google.calendar_id"), "");
  });

  it("retiring an Env removes its settings and machine state, nothing else", async () => {
    const env = withRecords(
      [
        row("forms.notify_email", "alerts@gwenda.co.uk", "staging", "web"),
        row("forms.notify_email", "alerts@gwenda.co.uk", "dev", "web"),
        row("site.build_snapshot", "{}", "staging", "web"),
      ],
      { SITE_ENV: "dev" },
    );
    assert.equal(await removeRetiredEnv(env, "staging"), 2);
    assert.deepEqual(
      (await env.configRepository.list()).map((r) => r.env),
      ["dev"],
    );
  });
});
