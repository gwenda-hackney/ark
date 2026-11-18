import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { D1_DATABASES } from "../../../../shared/d1-databases.js";
import { opsConnectionInfo, siteEnvName } from "./config-store.js";

describe("siteEnvName", () => {
  it("maps common SITE_ENV values", () => {
    assert.equal(siteEnvName({ SITE_ENV: "local" }), "dev");
    assert.equal(siteEnvName({ SITE_ENV: "dev" }), "dev");
    assert.equal(siteEnvName({ SITE_ENV: "production" }), "production");
    assert.equal(siteEnvName({ SITE_ENV: "prod" }), "production");
    assert.equal(siteEnvName({ SITE_ENV: "local" }), "dev");
    assert.throws(() => siteEnvName({}), /SITE_ENV is not set/);
  });
});

describe("opsConnectionInfo", () => {
  it("labels local clone clearly", () => {
    const info = opsConnectionInfo({ SITE_ENV: "local" });
    assert.equal(info.envLabel, "Dev · this machine");
    assert.equal(opsConnectionInfo({ SITE_ENV: "dev" }).envLabel, "Dev");
    assert.equal(info.databaseId, D1_DATABASES.dev.ops.id);
    assert.equal(info.isProductionDb, false);
    assert.equal(info.databaseLabel, "D1 gwenda-ops (dev)");
    assert.equal(info.risk, null);
  });

  it("labels production Ops DB", () => {
    const info = opsConnectionInfo({ SITE_ENV: "production" });
    assert.equal(info.envLabel, "Production");
    assert.equal(info.isProductionDb, true);
    assert.equal(info.databaseLabel, "D1 gwenda-ops");
    assert.equal(info.databaseId, D1_DATABASES.production.ops.id);
    assert.equal(info.risk, null);
  });

  it("flags a local copy on live data", () => {
    const info = opsConnectionInfo({ SITE_ENV: "production", OPS_LOCAL_LIVE: "1" });
    assert.equal(info.risk, "local_live");
    assert.equal(info.isProductionDb, true);
  });
});
