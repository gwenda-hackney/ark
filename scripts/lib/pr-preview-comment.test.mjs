import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { MARKER, previewCommentBody, upsertPreviewComment } from "./pr-preview-comment.mjs";

/** A fake GitHub: one open PR (or none) and its comments; writes are recorded. */
function fakeGitHub({ prs = [{ number: 7 }], comments = [] } = {}) {
  const writes = [];
  const fetchImpl = async (url, init = {}) => {
    const path = url.replace("https://api.github.com/repos/o/r", "");
    const method = init.method || "GET";
    let result;
    if (method === "GET" && path.startsWith("/pulls")) result = prs;
    else if (method === "GET") result = comments;
    else {
      writes.push({ method, path, body: JSON.parse(init.body).body });
      result = {};
    }
    return { ok: true, json: async () => result };
  };
  return { fetchImpl, writes };
}

describe("PR previews comment", () => {
  it("lists one app's preview", () => {
    const body = previewCommentBody("", { app: "web", url: "https://a.gwenda-web-dev.pages.dev", sha: "abcdef1234" });
    assert.ok(body.startsWith(MARKER));
    assert.match(body, /\| Website .* \| \[a\.gwenda-web-dev\.pages\.dev\]\(https:\/\/a\.gwenda-web-dev\.pages\.dev\) \| `abcdef1` /);
  });

  it("updates one app's row and keeps the others, in a fixed order", () => {
    let body = previewCommentBody("", { app: "ops", url: "https://o1.dev", sha: "1111111" });
    body = previewCommentBody(body, { app: "web", url: "https://w1.dev", sha: "2222222" });
    body = previewCommentBody(body, { app: "ops", url: "https://o2.dev", sha: "3333333" });
    const rows = body.split("\n").filter((line) => line.includes("<!-- app:"));
    assert.equal(rows.length, 2);
    assert.match(rows[0], /w1\.dev.*2222222/);
    assert.match(rows[1], /o2\.dev.*3333333/);
    assert.doesNotMatch(body, /o1\.dev/);
  });

  it("creates the comment on the branch's PR", async () => {
    const gh = fakeGitHub();
    const number = await upsertPreviewComment({ repo: "o/r", token: "t", branch: "feat/x", app: "web", url: "https://w.dev", sha: "abc1234", fetchImpl: gh.fetchImpl });
    assert.equal(number, 7);
    assert.equal(gh.writes.length, 1);
    assert.equal(gh.writes[0].method, "POST");
    assert.equal(gh.writes[0].path, "/issues/7/comments");
  });

  it("edits the existing comment instead of adding another", async () => {
    const existing = previewCommentBody("", { app: "ops", url: "https://o.dev", sha: "1111111" });
    const gh = fakeGitHub({ comments: [{ id: 5, body: "hi" }, { id: 9, body: existing }] });
    await upsertPreviewComment({ repo: "o/r", token: "t", branch: "feat/x", app: "web", url: "https://w.dev", sha: "abc1234", fetchImpl: gh.fetchImpl });
    assert.equal(gh.writes[0].method, "PATCH");
    assert.equal(gh.writes[0].path, "/issues/comments/9");
    assert.match(gh.writes[0].body, /o\.dev/);
    assert.match(gh.writes[0].body, /w\.dev/);
  });

  it("does nothing for a branch without an open PR", async () => {
    const gh = fakeGitHub({ prs: [] });
    const number = await upsertPreviewComment({ repo: "o/r", token: "t", branch: "feat/x", app: "web", url: "https://w.dev", sha: "abc1234", fetchImpl: gh.fetchImpl });
    assert.equal(number, 0);
    assert.equal(gh.writes.length, 0);
  });
});
