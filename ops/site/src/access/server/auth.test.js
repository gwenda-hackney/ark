import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  createOauthStateToken,
  createSessionToken,
  gateRedirectPath,
  isProtectedApiPath,
  isRequestAuthed,
  localSignInEmail,
  opsUserForbiddenResponse,
  requestOrigin,
  resolveAuth,
  resolveSessionEmail,
  safeRedirectPath,
  verifyOauthStateToken,
  verifySessionToken,
} from "./auth.js";

const GOOGLE = {
  GOOGLE_OAUTH_CLIENT_ID: "id",
  GOOGLE_OAUTH_CLIENT_SECRET: "sec",
  OPS_SESSION_SECRET: "sess",
};

describe("ops auth", () => {
  it("resolves Google when OAuth + session secret are set", () => {
    const auth = resolveAuth({ ...GOOGLE, SITE_ENV: "production" });
    assert.equal(auth.kind, "google");
  });

  it("ignores leftover CF_ACCESS_GOOGLE_* keys", () => {
    const auth = resolveAuth({
      CF_ACCESS_GOOGLE_CLIENT_ID: "id",
      CF_ACCESS_GOOGLE_CLIENT_SECRET: "sec",
      OPS_SESSION_SECRET: "sess",
    });
    assert.equal(auth.kind, "misconfigured");
  });

  it("has no password sign-in", () => {
    for (const env of [{ OPS_LOCAL_ADMIN_PW: "copper" }, { OPS_PASSWORD: "legacy" }]) {
      assert.equal(resolveAuth({ SITE_ENV: "local", ...env }).kind, "misconfigured");
    }
  });

  it("round-trips Google session tokens", async () => {
    const token = await createSessionToken("sess", "Person@Gwenda.com");
    assert.equal(await verifySessionToken("sess", token), "person@gwenda.com");
    assert.equal(await verifySessionToken("nope", token), "");
  });

  it("round-trips OAuth state cookies", async () => {
    const token = await createOauthStateToken("sess", "abc", "verifier");
    assert.deepEqual(await verifyOauthStateToken("sess", token), {
      state: "abc",
      codeVerifier: "verifier",
      returnTo: "",
    });
    const withReturn = await createOauthStateToken("sess", "abc", "verifier", "https://b.gwenda-ops-dev.pages.dev");
    assert.equal((await verifyOauthStateToken("sess", withReturn)).returnTo, "https://b.gwenda-ops-dev.pages.dev");
    assert.equal(await verifyOauthStateToken("nope", withReturn), null);
  });

  it("authenticates Google sessions from the cookie", async () => {
    const auth = resolveAuth({
      GOOGLE_OAUTH_CLIENT_ID: "id",
      GOOGLE_OAUTH_CLIENT_SECRET: "sec",
      OPS_SESSION_SECRET: "sess",
    });
    const token = await createSessionToken("sess", "person@gwenda.com");
    const req = new Request("http://localhost:5174/menu", {
      headers: { Cookie: `gwenda_ops_access=${token}` },
    });
    assert.equal(await resolveSessionEmail(req, auth), "person@gwenda.com");
    assert.equal(await isRequestAuthed(auth, req), true);
    assert.equal(
      await isRequestAuthed(auth, new Request("http://localhost:5174/menu")),
      false,
    );
  });

  it("signs a developer's machine in as OPS_LOCAL_SIGN_IN, without a cookie", async () => {
    const auth = resolveAuth({ ...GOOGLE, SITE_ENV: "local", OPS_LOCAL_SIGN_IN: " Developer@Gwenda.co.uk " });
    assert.deepEqual(auth, { kind: "local", email: "developer@gwenda.co.uk" });
    const req = new Request("http://localhost:5174/menu");
    assert.equal(await resolveSessionEmail(req, auth), "developer@gwenda.co.uk");
    assert.equal(await isRequestAuthed(auth, req), true);
  });

  it("needs no Google secrets on a developer's machine", () => {
    const auth = resolveAuth({ SITE_ENV: "local", OPS_LOCAL_SIGN_IN: "developer@gwenda.co.uk" });
    assert.equal(auth.kind, "local");
  });

  it.each([
    ["hosted production", { SITE_ENV: "production" }],
    ["hosted dev", { SITE_ENV: "dev" }],
    ["production by its short name", { SITE_ENV: "prod" }],
    ["no SITE_ENV", {}],
    ["a SITE_ENV only isLocalMachine knows", { SITE_ENV: "development" }],
    ["ops:prod", { SITE_ENV: "production", OPS_LOCAL_LIVE: "1" }],
    ["a local machine flagged live", { SITE_ENV: "local", OPS_LOCAL_LIVE: "1" }],
  ])("ignores OPS_LOCAL_SIGN_IN on %s", (_where, env) => {
    const withBinding = { ...env, OPS_LOCAL_SIGN_IN: "developer@gwenda.co.uk" };
    assert.equal(localSignInEmail(withBinding), "");
    assert.equal(resolveAuth({ ...GOOGLE, ...withBinding }).kind, "google");
    assert.equal(resolveAuth(withBinding).kind, "misconfigured");
  });

  it("is not local sign-in without the binding", () => {
    assert.equal(localSignInEmail({ SITE_ENV: "local" }), "");
    assert.equal(localSignInEmail({ SITE_ENV: "local", OPS_LOCAL_SIGN_IN: "  " }), "");
    assert.equal(resolveAuth({ ...GOOGLE, SITE_ENV: "local" }).kind, "google");
  });

  it("uses X-Forwarded-Host as the browser origin", () => {
    const req = new Request("http://127.0.0.1:8788/api/auth", {
      headers: {
        "X-Forwarded-Host": "localhost:5174",
        "X-Forwarded-Proto": "http",
      },
    });
    assert.equal(requestOrigin(req), "http://localhost:5174");
  });

  it("keeps API fetches off the HTML gate", () => {
    assert.equal(isProtectedApiPath("/api/menu"), true);
    assert.equal(isProtectedApiPath("/api/auth"), false);
    assert.equal(isProtectedApiPath("/api/auth/callback"), false);
    assert.equal(isProtectedApiPath("/gate/"), false);
  });

  it("maps menu API return paths to the shell route", () => {
    assert.equal(safeRedirectPath("/api/menu"), "/menu");
    assert.equal(safeRedirectPath("/api/inventory/lightspeed"), "/lightspeed");
    assert.equal(safeRedirectPath("/api/inventory"), "/inventory");
    assert.equal(safeRedirectPath("/api/suppliers"), "/suppliers");
    assert.equal(safeRedirectPath("/api/venue"), "/venue");
    assert.equal(safeRedirectPath("/api/venue/gallery/abc"), "/venue/gallery");
    assert.equal(gateRedirectPath("/stock/"), "/gate/?next=%2Fstock");
  });

  it("returns 403 when the email is not a user", async () => {
    const html = opsUserForbiddenResponse();
    assert.equal(html.status, 403);
    assert.match(html.headers.get("Content-Type"), /^text\/html/);
    const body = await html.text();
    assert.match(body, /<h1>Not on the ops users list<\/h1>/);
    assert.match(body, /href="\/api\/auth\/logout">Sign out</);
    assert.match(body, /background:#0b0b0c/);
    // System fonts only: nothing to swap in.
    assert.doesNotMatch(body, /fonts\.googleapis|@font-face/);
  });

  it("returns a coded JSON 403 for API requests", async () => {
    const res = opsUserForbiddenResponse({ json: true });
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), {
      error: "That Google account is not on the ops users list.",
      code: "not_ops_user",
    });
  });
});
