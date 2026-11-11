/**
 * /api/auth tells the gate page how sign-in works here: Google, or signed in
 * automatically on a developer's machine (`npm run ops:dev`). There is no
 * password sign-in.
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import * as gateApi from "./auth.js";

const google = {
  GOOGLE_OAUTH_CLIENT_ID: "client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
  OPS_SESSION_SECRET: "test-session-secret",
};

async function modeOn(env) {
  const request = new Request("http://localhost:5174/api/auth");
  const res = await gateApi.onRequestGet({ request, env, data: { opsEnv: env } });
  return { status: res.status, ...(await res.json()) };
}

describe("/api/auth", () => {
  it("is local on a developer's machine", async () => {
    const res = await modeOn({ ...google, SITE_ENV: "local", OPS_LOCAL_SIGN_IN: "developer@gwenda.co.uk" });
    assert.deepEqual(res, { status: 200, mode: "local" });
  });

  it.each([
    ["hosted production", { SITE_ENV: "production" }],
    ["hosted dev", { SITE_ENV: "dev" }],
    ["ops:prod", { SITE_ENV: "production", OPS_LOCAL_LIVE: "1" }],
  ])("is Google on %s, even with the local binding set", async (_where, env) => {
    const res = await modeOn({ ...google, OPS_LOCAL_SIGN_IN: "developer@gwenda.co.uk", ...env });
    assert.deepEqual(res, { status: 200, mode: "google" });
  });

  it("has no password sign-in, whatever the env holds", async () => {
    assert.equal(gateApi.onRequestPost, undefined);
    const res = await modeOn({ SITE_ENV: "local", OPS_LOCAL_ADMIN_PW: "canal-side", OPS_PASSWORD: "canal-side" });
    assert.deepEqual(res, { status: 503, mode: "misconfigured" });
  });
});
