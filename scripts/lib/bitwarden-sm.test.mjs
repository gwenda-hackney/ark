import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARK_ENV_SECRET_KEYS,
  OPS_CONSUMES_WEB_SECRET_KEYS,
  OPS_ENV_SECRET_KEYS,
  WEB_ENV_SECRET_KEYS,
  formatArkEnv,
  mergeSmSecretMaps,
  pickArkSecrets,
  pickOpsSecrets,
  pickWebSecrets,
} from "./bitwarden-sm.mjs";

describe("SM key ownership", () => {
  it("keeps web-owned keys on both the web list and the ops consume list", () => {
    for (const key of OPS_CONSUMES_WEB_SECRET_KEYS) {
      assert.ok(WEB_ENV_SECRET_KEYS.includes(key), `${key} missing from WEB_ENV_SECRET_KEYS`);
      assert.ok(OPS_ENV_SECRET_KEYS.includes(key), `${key} missing from OPS_ENV_SECRET_KEYS`);
    }
  });

  it("does not put Cloudflare or Baserow tokens on the wrong project lists", () => {
    for (const key of ARK_ENV_SECRET_KEYS) {
      assert.equal(OPS_ENV_SECRET_KEYS.includes(key), false);
      assert.equal(WEB_ENV_SECRET_KEYS.includes(key), false);
    }
    assert.equal(ARK_ENV_SECRET_KEYS.includes("BASEROW_API_KEY"), false);
    assert.equal(ARK_ENV_SECRET_KEYS.includes("SANITY_API_TOKEN"), false);
  });
});

describe("mergeSmSecretMaps", () => {
  it("lets later maps win and reports value conflicts", () => {
    const conflicts = [];
    const merged = mergeSmSecretMaps(
      [
        new Map([
          ["SANITY_API_TOKEN", "web"],
          ["CLOUDFLARE_ACCOUNT_ID", "acct"],
        ]),
        new Map([["BASEROW_API_KEY", "ops"]]),
        new Map([["SANITY_API_TOKEN", "ops-copy"]]),
      ],
      { onConflict: (key) => conflicts.push(key) },
    );
    assert.equal(merged.get("SANITY_API_TOKEN"), "ops-copy");
    assert.equal(merged.get("CLOUDFLARE_ACCOUNT_ID"), "acct");
    assert.equal(merged.get("BASEROW_API_KEY"), "ops");
    assert.deepEqual(conflicts, ["SANITY_API_TOKEN"]);
  });

  it("does not warn when the same key has the same value", () => {
    const conflicts = [];
    mergeSmSecretMaps(
      [
        new Map([["SANITY_API_TOKEN", "same"]]),
        new Map([["SANITY_API_TOKEN", "same"]]),
      ],
      { onConflict: (key) => conflicts.push(key) },
    );
    assert.deepEqual(conflicts, []);
  });
});

describe("pick helpers", () => {
  it("picks Ark Cloudflare keys only", () => {
    const picked = pickArkSecrets(
      new Map([
        ["CLOUDFLARE_DEV_API_TOKEN", "dev"],
        ["SMTP_PASSWORD", "nope"],
      ]),
    );
    assert.equal(picked.get("CLOUDFLARE_DEV_API_TOKEN"), "dev");
    assert.equal(picked.has("SMTP_PASSWORD"), false);
  });

  it("lets ops read web-owned Sanity and deploy webhook keys", () => {
    const picked = pickOpsSecrets(
      new Map([
        ["SANITY_API_TOKEN", "from-web"],
        ["DEPLOY_WEBHOOK_SECRET", "hook"],
        ["SMTP_PASSWORD", "mail"],
      ]),
    );
    assert.equal(picked.get("SANITY_API_TOKEN"), "from-web");
    assert.equal(picked.get("DEPLOY_WEBHOOK_SECRET"), "hook");
    assert.equal(picked.has("SMTP_PASSWORD"), false);
  });

  it("includes DEPLOY_WEBHOOK_SECRET in web picks", () => {
    const picked = pickWebSecrets(
      new Map([
        ["BASEROW_API_KEY_MARKETING", "mkt"],
        ["DEPLOY_WEBHOOK_SECRET", "hook"],
      ]),
    );
    assert.equal(picked.get("BASEROW_API_KEY"), "mkt");
    assert.equal(picked.get("DEPLOY_WEBHOOK_SECRET"), "hook");
  });
});

describe("formatArkEnv", () => {
  it("writes the Ark key list in order", () => {
    const text = formatArkEnv(
      new Map([
        ["CLOUDFLARE_DEV_API_TOKEN", "dev"],
        ["CLOUDFLARE_ACCOUNT_ID", "acct"],
      ]),
    );
    assert.match(text, /CLOUDFLARE_DEV_API_TOKEN=dev/);
    assert.match(text, /CLOUDFLARE_API_TOKEN=/);
    assert.match(text, /CLOUDFLARE_ACCOUNT_ID=acct/);
  });
});
