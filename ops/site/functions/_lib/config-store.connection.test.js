import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OPS_PRODUCTION_DATABASE_ID } from "./baserow.js";
import { opsConnectionInfo, siteEnvName } from "./config-store.js";

describe("siteEnvName", () => {
  it("maps common SITE_ENV values", () => {
    assert.equal(siteEnvName({ SITE_ENV: "local" }), "dev");
    assert.equal(siteEnvName({ SITE_ENV: "dev" }), "dev");
    assert.equal(siteEnvName({ SITE_ENV: "production" }), "production");
    assert.equal(siteEnvName({ SITE_ENV: "prod" }), "production");
    assert.equal(siteEnvName({ SITE_ENV: "local" }), "dev");
    assert.equal(siteEnvName({}), "production");
  });
});

describe("opsConnectionInfo", () => {
  it("labels local clone clearly", () => {
    const info = opsConnectionInfo({
      SITE_ENV: "local",
      BASEROW_OPS_DATABASE_ID: "560292",
    });
    assert.equal(info.envLabel, "Dev · this machine");
    assert.equal(
      opsConnectionInfo({ SITE_ENV: "dev", BASEROW_OPS_DATABASE_ID: "560292" }).envLabel,
      "Dev",
    );
    assert.equal(info.databaseId, "560292");
    assert.equal(info.isProductionDb, false);
    assert.equal(info.databaseLabel, "Gwenda Ops (dev)");
    assert.equal(info.risk, null);
  });

  it("labels production Ops DB", () => {
    const info = opsConnectionInfo({
      SITE_ENV: "production",
      BASEROW_OPS_DATABASE_ID: OPS_PRODUCTION_DATABASE_ID,
    });
    assert.equal(info.envLabel, "Production");
    assert.equal(info.isProductionDb, true);
    assert.equal(info.databaseLabel, "Gwenda Ops");
    assert.equal(info.risk, null);
  });

  it("flags local pointed at production DB", () => {
    const info = opsConnectionInfo({
      SITE_ENV: "local",
      BASEROW_OPS_DATABASE_ID: OPS_PRODUCTION_DATABASE_ID,
    });
    assert.equal(info.risk, "nonprod_on_production_db");
  });
});
