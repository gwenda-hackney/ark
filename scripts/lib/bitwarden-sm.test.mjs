import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APP_SECRETS,
  SECRET_OWNERS,
  envSecretKey,
  ownerOf,
  parseSecretKey,
  pickAppSecrets,
  resolveSecretsForEnv,
  smNameFor,
} from "./bitwarden-sm.mjs";

describe("parseSecretKey", () => {
  it("splits env overrides and leaves shared names alone", () => {
    assert.deepEqual(parseSecretKey("BASEROW_OPS_API_KEY__LOCAL"), {
      name: "BASEROW_OPS_API_KEY",
      env: "local",
    });
    assert.deepEqual(parseSecretKey("SANITY_API_TOKEN"), {
      name: "SANITY_API_TOKEN",
      env: null,
    });
    assert.deepEqual(parseSecretKey("WEIRD__THING"), { name: "WEIRD__THING", env: null });
  });

  it("round-trips with envSecretKey", () => {
    assert.equal(envSecretKey("FORMS_ADMIN_SECRET", "staging"), "FORMS_ADMIN_SECRET__STAGING");
    assert.equal(envSecretKey("FORMS_ADMIN_SECRET", ""), "FORMS_ADMIN_SECRET");
  });
});

describe("resolveSecretsForEnv", () => {
  const raw = new Map([
    ["SANITY_API_TOKEN", "shared"],
    ["BASEROW_OPS_API_KEY__LOCAL", "ops-local"],
    ["BASEROW_OPS_API_KEY__PRODUCTION", "ops-prod"],
    ["FORMS_ADMIN_SECRET", "shared-forms"],
    ["FORMS_ADMIN_SECRET__PRODUCTION", "prod-forms"],
    ["EMPTY__LOCAL", ""],
  ]);

  it("lets the env override win over the shared value", () => {
    const prod = resolveSecretsForEnv(raw, "production");
    assert.equal(prod.get("FORMS_ADMIN_SECRET"), "prod-forms");
    assert.equal(prod.get("SANITY_API_TOKEN"), "shared");
    const local = resolveSecretsForEnv(raw, "local");
    assert.equal(local.get("FORMS_ADMIN_SECRET"), "shared-forms");
  });

  it("never falls back across envs", () => {
    const staging = resolveSecretsForEnv(raw, "staging");
    assert.equal(staging.has("BASEROW_OPS_API_KEY"), false);
    assert.equal(resolveSecretsForEnv(raw, "local").get("BASEROW_OPS_API_KEY"), "ops-local");
  });

  it("drops override keys from the output and ignores empty values", () => {
    const local = resolveSecretsForEnv(raw, "development");
    assert.equal([...local.keys()].some((key) => key.includes("__")), false);
    assert.equal(local.has("EMPTY"), false);
  });
});

describe("pickAppSecrets", () => {
  it("renames each app's own Baserow token to BASEROW_API_KEY", () => {
    const resolved = new Map([
      ["BASEROW_OPS_API_KEY", "ops"],
      ["BASEROW_WEBSITE_API_KEY", "web"],
      ["GOOGLE_SERVICE_ACCOUNT_JSON", "{}"],
    ]);
    const ops = pickAppSecrets("ops", resolved).values;
    assert.equal(ops.get("BASEROW_API_KEY"), "ops");
    assert.equal(ops.get("BASEROW_WEBSITE_API_KEY"), "web");
    assert.equal(ops.get("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON"), "{}");
    const web = pickAppSecrets("web", resolved).values;
    assert.equal(web.get("BASEROW_API_KEY"), "web");
    assert.equal(web.get("BASEROW_OPS_API_KEY"), "ops");
    assert.equal(web.get("GMAIL_SERVICE_ACCOUNT_JSON"), "{}");
  });

  it("reports missing keys by runtime name", () => {
    const { missing } = pickAppSecrets("ark", new Map([["CLOUDFLARE_ACCOUNT_ID", "a"]]));
    assert.deepEqual(missing, ["CLOUDFLARE_DEV_API_TOKEN", "CLOUDFLARE_API_TOKEN"]);
  });
});

describe("catalog", () => {
  it("gives every app key an owning project", () => {
    for (const app of Object.keys(APP_SECRETS)) {
      for (const key of APP_SECRETS[app].keys) {
        assert.ok(ownerOf(smNameFor(app, key)), `${app} ${key} has no owner`);
      }
    }
  });

  it("owns each SM name in one project only", () => {
    const all = Object.values(SECRET_OWNERS).flat();
    assert.equal(new Set(all).size, all.length);
  });

  it("keeps Lightspeed and the local admin password off Pages", () => {
    for (const key of ["OPS_LOCAL_ADMIN_PW", "LIGHTSPEED_BO_PASSWORD"]) {
      assert.ok(APP_SECRETS.ops.pagesSkip.includes(key));
    }
  });
});
