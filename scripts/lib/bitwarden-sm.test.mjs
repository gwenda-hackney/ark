import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  APP_SECRETS,
  SECRET_OWNERS,
  envSecretKey,
  isSmRateLimited,
  ownerOf,
  parseSecretKey,
  pickAppSecrets,
  resolveSecretsForEnv,
  smNameFor,
  smRetryDelayMs,
} from "./bitwarden-sm.mjs";

describe("parseSecretKey", () => {
  it("splits env overrides and leaves shared names alone", () => {
    assert.deepEqual(parseSecretKey("BASEROW_OPS_API_KEY__DEV"), {
      name: "BASEROW_OPS_API_KEY",
      env: "dev",
    });
    assert.deepEqual(parseSecretKey("SANITY_API_TOKEN"), {
      name: "SANITY_API_TOKEN",
      env: null,
    });
    assert.deepEqual(parseSecretKey("WEIRD__THING"), { name: "WEIRD__THING", env: null });
    // Retired env names are not envs any more.
    assert.equal(parseSecretKey("SANITY_API_TOKEN__LOCAL").env, null);
  });

  it("round-trips with envSecretKey", () => {
    assert.equal(envSecretKey("FORMS_ADMIN_SECRET", "dev"), "FORMS_ADMIN_SECRET__DEV");
    assert.equal(envSecretKey("FORMS_ADMIN_SECRET", ""), "FORMS_ADMIN_SECRET");
  });
});

describe("resolveSecretsForEnv", () => {
  const raw = new Map([
    ["SANITY_API_TOKEN", "shared"],
    ["BASEROW_OPS_API_KEY__DEV", "ops-dev"],
    ["BASEROW_OPS_API_KEY__PRODUCTION", "ops-prod"],
    ["FORMS_ADMIN_SECRET", "shared-forms"],
    ["FORMS_ADMIN_SECRET__PRODUCTION", "prod-forms"],
    ["EMPTY__DEV", ""],
  ]);

  it("lets the env override win over the shared value", () => {
    const prod = resolveSecretsForEnv(raw, "production");
    assert.equal(prod.get("FORMS_ADMIN_SECRET"), "prod-forms");
    assert.equal(prod.get("SANITY_API_TOKEN"), "shared");
    const dev = resolveSecretsForEnv(raw, "dev");
    assert.equal(dev.get("FORMS_ADMIN_SECRET"), "shared-forms");
    assert.equal(dev.get("BASEROW_OPS_API_KEY"), "ops-dev");
  });

  it("treats a developer's machine as dev", () => {
    for (const name of ["local", "development", "dev"]) {
      assert.equal(resolveSecretsForEnv(raw, name).get("BASEROW_OPS_API_KEY"), "ops-dev");
    }
  });

  it("keeps suffixed names, so another env's value can be asked for by name", () => {
    const prod = resolveSecretsForEnv(raw, "production");
    assert.equal(prod.get("BASEROW_OPS_API_KEY"), "ops-prod");
    assert.equal(prod.get("BASEROW_OPS_API_KEY__DEV"), "ops-dev");
  });

  it("ignores empty values", () => {
    const dev = resolveSecretsForEnv(raw, "dev");
    assert.equal(dev.has("EMPTY"), false);
    assert.equal(dev.has("EMPTY__DEV"), false);
  });

  it("rejects envs that no longer exist", () => {
    assert.throws(() => resolveSecretsForEnv(raw, "staging"), /Unknown env/);
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
    assert.deepEqual(missing, ["CLOUDFLARE_API_TOKEN"]);
  });

  it("gives production ops the dev ops token under its suffixed name", () => {
    const resolved = resolveSecretsForEnv(
      new Map([
        ["BASEROW_OPS_API_KEY__PRODUCTION", "ops-prod"],
        ["BASEROW_OPS_API_KEY__DEV", "ops-dev"],
      ]),
      "production",
    );
    const ops = pickAppSecrets("ops", resolved).values;
    assert.equal(ops.get("BASEROW_API_KEY"), "ops-prod");
    assert.equal(ops.get("BASEROW_OPS_API_KEY__DEV"), "ops-dev");
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

  it("keeps the local admin password off Pages", () => {
    assert.ok(APP_SECRETS.ops.pagesSkip.includes("OPS_LOCAL_ADMIN_PW"));
  });
});

describe("Secrets Manager rate limits", () => {
  it("recognises the 429 bws prints, and nothing else", () => {
    const bws429 =
      'Error: \n   0: Received error message from server: [429 Too Many Requests] {"object":"error","message":"Slow down! Too many requests. Try again in 1s."}';
    assert.equal(isSmRateLimited(bws429), true);
    assert.equal(isSmRateLimited("[401 Unauthorized] invalid access token"), false);
    assert.equal(isSmRateLimited("Resource not found"), false);
    assert.equal(isSmRateLimited(""), false);
  });

  it("backs off 1.5s, 3s, 6s, 12s", () => {
    assert.deepEqual([1, 2, 3, 4].map(smRetryDelayMs), [1500, 3000, 6000, 12000]);
  });
});
