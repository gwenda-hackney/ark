import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { deleteDeployment, getProject, listDeployments } from "./pages-api.mjs";

/** A fake Cloudflare: `responses` answer the calls in turn; calls are recorded. */
function fakeCloudflare(responses) {
  const calls = [];
  const fetchImpl = async (url, { method }) => {
    calls.push(`${method} ${url.replace(/^.*\/pages\/projects\//, "")}`);
    const [status, body] = responses.shift();
    return { status, json: async () => body };
  };
  return { api: { accountId: "acc", token: "tok", fetchImpl, retryDelayMs: 0 }, calls };
}

const page = (ids, totalPages) => [
  200,
  { success: true, result: ids.map((id) => ({ id })), result_info: { total_pages: totalPages } },
];

describe("pages api", () => {
  it("lists every page of deployments, once each though a deploy shifts the pages", async () => {
    const cf = fakeCloudflare([page(["a", "b"], 2), page(["b", "c"], 2)]);
    const all = await listDeployments(cf.api, "gwenda-web-dev");
    assert.deepEqual(
      all.map((deployment) => deployment.id),
      ["a", "b", "c"],
    );
    assert.deepEqual(cf.calls, [
      "GET gwenda-web-dev/deployments?per_page=25&page=1",
      "GET gwenda-web-dev/deployments?per_page=25&page=2",
    ]);
  });

  it("retries Cloudflare's occasional 5xx", async () => {
    const cf = fakeCloudflare([
      [502, {}],
      [200, { success: true, result: { name: "gwenda-web-dev" } }],
    ]);
    assert.equal((await getProject(cf.api, "gwenda-web-dev")).name, "gwenda-web-dev");
    assert.equal(cf.calls.length, 2);
  });

  it("deletes with force, so a branch's aliased newest deployment goes too", async () => {
    const cf = fakeCloudflare([[200, { success: true, result: null }]]);
    await deleteDeployment(cf.api, "gwenda-web-dev", "abc");
    assert.deepEqual(cf.calls, ["DELETE gwenda-web-dev/deployments/abc?force=true"]);
  });

  it("says why Cloudflare refused, with the HTTP status", async () => {
    const cf = fakeCloudflare([[404, { success: false, errors: [{ message: "not found" }] }]]);
    await assert.rejects(deleteDeployment(cf.api, "p", "gone"), (err) => {
      assert.match(err.message, /DELETE p\/deployments\/gone\?force=true: not found/);
      assert.equal(err.status, 404);
      return true;
    });
  });
});
