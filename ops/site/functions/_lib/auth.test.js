import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACCESS_EMAIL_HEADER,
  accessEmail,
  accessLogoutPath,
  accessRequiredResponse,
  createAccessEmailToken,
  createPasswordToken,
  gateRedirectPath,
  isProtectedApiPath,
  isRequestAuthed,
  opsUserForbiddenResponse,
  requestOrigin,
  resolveAccessEmail,
  resolveAuth,
  safeRedirectPath,
  signInRequiredResponse,
  verifyAccessEmailToken,
  verifyPasswordToken,
} from "./auth.js";

describe("ops auth", () => {
  it("resolves Access when no password is set", () => {
    const auth = resolveAuth({});
    assert.equal(auth.kind, "access");
    assert.equal(auth.local, false);
  });

  it("uses the password gate when OPS_PASSWORD is set", () => {
    const auth = resolveAuth({
      OPS_PASSWORD: "copper",
    });
    assert.equal(auth.kind, "password");
    assert.equal(auth.password, "copper");
  });

  it("forces local Access mode when OPS_AUTH_MODE=access", () => {
    const auth = resolveAuth({
      OPS_AUTH_MODE: "access",
      OPS_PASSWORD: "copper",
      OPS_DEV_ACCESS_EMAIL: "Person@Gwenda.com",
    });
    assert.equal(auth.kind, "access");
    assert.equal(auth.local, true);
    assert.equal(auth.sessionSecret, "copper");
    assert.equal(auth.defaultEmail, "person@gwenda.com");
  });

  it("round-trips password tokens", async () => {
    const token = await createPasswordToken("secret");
    assert.equal(await verifyPasswordToken("secret", token), true);
    assert.equal(await verifyPasswordToken("nope", token), false);
  });

  it("round-trips local Access email tokens", async () => {
    const token = await createAccessEmailToken("secret", "Person@Gwenda.com");
    assert.equal(await verifyAccessEmailToken("secret", token), "person@gwenda.com");
    assert.equal(await verifyAccessEmailToken("nope", token), "");
  });

  it("reads the Access email header", () => {
    const req = new Request("https://gwenda-ops.pages.dev/menu", {
      headers: { [ACCESS_EMAIL_HEADER]: "Person@Gwenda.com" },
    });
    assert.equal(accessEmail(req), "person@gwenda.com");
  });

  it("authenticates production Access by header", async () => {
    const auth = resolveAuth({});
    const withHeader = new Request("https://gwenda-ops.pages.dev/", {
      headers: { [ACCESS_EMAIL_HEADER]: "person@gwenda.com" },
    });
    assert.equal(await isRequestAuthed(auth, withHeader), true);
    assert.equal(
      await isRequestAuthed(auth, new Request("https://gwenda-ops.pages.dev/")),
      false,
    );
  });

  it("ignores a spoofed Access header in local Access mode", async () => {
    const auth = resolveAuth({
      OPS_AUTH_MODE: "access",
      OPS_PASSWORD: "copper",
    });
    const req = new Request("http://localhost:5174/", {
      headers: { [ACCESS_EMAIL_HEADER]: "person@gwenda.com" },
    });
    assert.equal(await resolveAccessEmail(req, auth), "");
    assert.equal(await isRequestAuthed(auth, req), false);
  });

  it("uses the signed local Access cookie", async () => {
    const auth = resolveAuth({
      OPS_AUTH_MODE: "access",
      OPS_PASSWORD: "copper",
    });
    const token = await createAccessEmailToken("copper", "person@gwenda.com");
    const req = new Request("http://localhost:5174/menu", {
      headers: { Cookie: `gwenda_ops_access=${token}` },
    });
    assert.equal(await resolveAccessEmail(req, auth), "person@gwenda.com");
    assert.equal(await isRequestAuthed(auth, req), true);
  });

  it("falls back to OPS_DEV_ACCESS_EMAIL when no cookie", async () => {
    const auth = resolveAuth({
      OPS_AUTH_MODE: "access",
      OPS_PASSWORD: "copper",
      OPS_DEV_ACCESS_EMAIL: "person@gwenda.com",
    });
    assert.equal(
      await resolveAccessEmail(new Request("http://localhost:5174/"), auth),
      "person@gwenda.com",
    );
  });

  it("ignores a spoofed Access header when OPS_PASSWORD is set", async () => {
    const auth = resolveAuth({
      OPS_PASSWORD: "copper",
    });
    const req = new Request("http://localhost:5174/", {
      headers: { [ACCESS_EMAIL_HEADER]: "person@gwenda.com" },
    });
    assert.equal(await isRequestAuthed(auth, req), false);
  });

  it("authenticates local password cookies", async () => {
    const auth = resolveAuth({ OPS_PASSWORD: "copper" });
    const token = await createPasswordToken("copper");
    const req = new Request("http://localhost:5174/menu", {
      headers: { Cookie: `gwenda_ops_access=${token}` },
    });
    assert.equal(await isRequestAuthed(auth, req), true);
    assert.equal(
      await isRequestAuthed(auth, new Request("http://localhost:5174/menu")),
      false,
    );
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
    assert.equal(isProtectedApiPath("/gate/"), false);
  });

  it("maps menu API return paths to the shell route", () => {
    assert.equal(safeRedirectPath("/api/menu"), "/menu");
    assert.equal(safeRedirectPath("/#/menu"), "/menu");
    assert.equal(safeRedirectPath("/menu/#/menu"), "/menu");
    assert.equal(safeRedirectPath("/menu/abc"), "/menu/abc");
    assert.equal(safeRedirectPath("/api/auth/callback"), "/");
    assert.equal(gateRedirectPath("/stock/"), "/gate/?next=%2Fstock");
    assert.equal(accessLogoutPath(), "/cdn-cgi/access/logout");
  });

  it("returns JSON 401 for unauthenticated API calls", async () => {
    const res = signInRequiredResponse();
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("Location"), null);
    const body = await res.json();
    assert.equal(body.error, "Sign in required.");
  });

  it("returns 403 when Access did not inject identity", async () => {
    const res = accessRequiredResponse();
    assert.equal(res.status, 403);
  });

  it("returns 403 when Google signed in but the email is not a user", async () => {
    const html = opsUserForbiddenResponse();
    assert.equal(html.status, 403);
    assert.equal(
      await html.text(),
      "That Google account is not on the ops users list.",
    );
    const api = opsUserForbiddenResponse({ json: true });
    assert.equal(api.headers.get("Content-Type"), "application/json");
    const body = await api.json();
    assert.equal(body.error, "That Google account is not on the ops users list.");
  });
});
