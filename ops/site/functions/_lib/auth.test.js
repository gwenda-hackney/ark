import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createOauthStateToken,
  createPasswordToken,
  createSessionToken,
  gateRedirectPath,
  isProtectedApiPath,
  isRequestAuthed,
  opsUserForbiddenResponse,
  requestOrigin,
  resolveAuth,
  resolveSessionEmail,
  safeRedirectPath,
  verifyOauthStateToken,
  verifyPasswordToken,
  verifySessionToken,
} from "./auth.js";

describe("ops auth", () => {
  it("resolves Google when OAuth + session secret are set", () => {
    const auth = resolveAuth({
      GOOGLE_OAUTH_CLIENT_ID: "id",
      GOOGLE_OAUTH_CLIENT_SECRET: "sec",
      OPS_SESSION_SECRET: "sess",
      OPS_PASSWORD: "copper",
    });
    assert.equal(auth.kind, "google");
    assert.equal(auth.password, "copper");
  });

  it("ignores leftover CF_ACCESS_GOOGLE_* keys", () => {
    const auth = resolveAuth({
      CF_ACCESS_GOOGLE_CLIENT_ID: "id",
      CF_ACCESS_GOOGLE_CLIENT_SECRET: "sec",
      OPS_SESSION_SECRET: "sess",
    });
    assert.equal(auth.kind, "misconfigured");
  });

  it("uses the password gate when Google is not configured", () => {
    const auth = resolveAuth({ OPS_PASSWORD: "copper" });
    assert.equal(auth.kind, "password");
    assert.equal(auth.password, "copper");
  });

  it("round-trips password tokens", async () => {
    const token = await createPasswordToken("secret");
    assert.equal(await verifyPasswordToken("secret", token), true);
    assert.equal(await verifyPasswordToken("nope", token), false);
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
    });
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

  it("authenticates local password cookies", async () => {
    const auth = resolveAuth({ OPS_PASSWORD: "copper" });
    const token = await createPasswordToken("copper");
    const req = new Request("http://localhost:5174/menu", {
      headers: { Cookie: `gwenda_ops_access=${token}` },
    });
    assert.equal(await isRequestAuthed(auth, req), true);
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
    assert.equal(gateRedirectPath("/stock/"), "/gate/?next=%2Fstock");
  });

  it("returns 403 when the email is not a user", async () => {
    const html = opsUserForbiddenResponse();
    assert.equal(html.status, 403);
    assert.equal(
      await html.text(),
      "That Google account is not on the ops users list.",
    );
  });
});
