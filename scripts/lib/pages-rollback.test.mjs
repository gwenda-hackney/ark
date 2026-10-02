import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { liveDeploymentId, rollBack } from "./pages-rollback.mjs";

/** A fake Cloudflare API: `live` is the canonical deployment; calls are recorded. */
function fakeCloudflare({ live = "old", fail = "" } = {}) {
  const calls = [];
  const fetchImpl = async (url, { method }) => {
    const path = url.replace(/^.*\/pages\/projects\//, "");
    calls.push(`${method} ${path}`);
    if (fail && path.endsWith(fail)) {
      return { status: 400, json: async () => ({ success: false, errors: [{ message: "nope" }] }) };
    }
    if (method === "POST") {
      live = path.split("/")[2];
      return { status: 200, json: async () => ({ success: true, result: { id: live } }) };
    }
    return { status: 200, json: async () => ({ success: true, result: { canonical_deployment: live ? { id: live } : null } }) };
  };
  return { api: { accountId: "acc", token: "tok", fetchImpl }, calls, live: () => live };
}

describe("pages rollback", () => {
  it("reads the live deployment", async () => {
    const cf = fakeCloudflare({ live: "abc" });
    assert.equal(await liveDeploymentId(cf.api, "gwenda"), "abc");
    assert.equal(await liveDeploymentId(fakeCloudflare({ live: "" }).api, "gwenda"), "");
  });

  it("puts the previous deployment back after a new one went live", async () => {
    const cf = fakeCloudflare({ live: "new" });
    assert.equal(await rollBack(cf.api, "gwenda", "old"), "rolled-back");
    assert.equal(cf.live(), "old");
    assert.deepEqual(cf.calls, ["GET gwenda", "POST gwenda/deployments/old/rollback"]);
  });

  it("leaves things alone when the new deployment never went live", async () => {
    const cf = fakeCloudflare({ live: "old" });
    assert.equal(await rollBack(cf.api, "gwenda", "old"), "already-live");
    assert.deepEqual(cf.calls, ["GET gwenda"]);
  });

  it("has nothing to do on a first deploy", async () => {
    const cf = fakeCloudflare({ live: "new" });
    assert.equal(await rollBack(cf.api, "gwenda", ""), "nothing-to-roll-back-to");
    assert.deepEqual(cf.calls, []);
  });

  it("says why Cloudflare refused", async () => {
    const cf = fakeCloudflare({ live: "new", fail: "rollback" });
    await assert.rejects(rollBack(cf.api, "gwenda", "old"), /rollback: nope/);
  });
});
