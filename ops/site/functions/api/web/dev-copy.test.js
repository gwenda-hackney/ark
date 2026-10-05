/**
 * POST /api/web/dev-copy: copies production over dev through the deploy
 * webhook. Only production ops may start it, since the copy reads production.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { onRequestPost as devCopy } from "./dev-copy.js";
import { dispatchDevCopy } from "../../../src/website/server/site-deploy.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const devEnv = {
  SITE_ENV: "dev",
  GOOGLE_OAUTH_CLIENT_ID: "client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
  OPS_SESSION_SECRET: "test-session-secret",
  SITE_DEPLOY_WEBHOOK_URL: "https://hook.example/",
  DEPLOY_WEBHOOK_SECRET: "hook-secret",
};

function post(env, body) {
  const request = new Request("https://gwenda-ops-dev.pages.dev/api/web/dev-copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return devCopy({ env, request, data: { opsEnv: env } });
}

describe("POST /api/web/dev-copy", () => {
  it("refuses unknown targets and a missing confirm", async () => {
    const bad = await post(devEnv, { target: "production", confirm: "production" });
    assert.equal(bad.status, 400);
    const unconfirmed = await post(devEnv, { target: "everything" });
    assert.equal(unconfirmed.status, 400);
    assert.match((await unconfirmed.json()).error, /confirm: "everything"/);
  });

  it("refuses dev ops before calling the webhook", async () => {
    let called = false;
    globalThis.fetch = async () => ((called = true), new Response("{}"));
    const res = await post(devEnv, { target: "everything", confirm: "everything" });
    assert.equal(res.status, 403);
    assert.equal(called, false);
  });
});

describe("dispatchDevCopy", () => {
  it("posts the target to the webhook's /dev-copy from production ops", async () => {
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json({ ok: true, runId: 9, runUrl: "run9", status: "queued" }, { status: 202 });
    };
    const run = await dispatchDevCopy({ ...devEnv, SITE_ENV: "production" }, "content");
    assert.equal(run.runId, 9);
    assert.equal(calls[0].url, "https://hook.example/dev-copy");
    assert.deepEqual(JSON.parse(calls[0].init.body), { target: "content" });
  });
});
