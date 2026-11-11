/**
 * Sign-in: the return path stays on this site. After the gate, the password
 * form or Google sign-in, the browser goes back to the page asked for
 * (`next`), and whatever `next` says, it lands on ops itself. Checked as a
 * browser resolves the Location it gets. Google and Baserow are faked.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";
import { protect as middleware } from "../../../functions/_middleware.js";
import { onRequestPost as passwordSignIn } from "../../../functions/api/auth.js";
import { onRequestGet as callback } from "../../../functions/api/auth/callback.js";
import { onRequestGet as login } from "../../../functions/api/auth/login.js";
import { AUTH_COOKIE_NAME, createPasswordToken, parseCookies } from "./auth.js";
import { resetBaserowClientForTests } from "../../../../../shared/baserow.js";
import { resetUsersCacheForTests } from "../../users/server/user-store.js";

const SITE = "https://gwenda-ops-dev.pages.dev";
const PASSWORD = "local-admin-pw";
const passwordEnv = { SITE_ENV: "dev", OPS_LOCAL_ADMIN_PW: PASSWORD };
const googleEnv = {
  SITE_ENV: "dev",
  GOOGLE_OAUTH_CLIENT_ID: "client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
  OPS_SESSION_SECRET: "test-session-secret",
  BASEROW_API_KEY: "baserow-token",
};

/** `next` values that point somewhere other than a page on ops, as typed. */
const notOnOps = [
  ["a backslash", "/\\elsewhere.example/x"],
  ["two backslashes", "/\\\\elsewhere.example/x"],
  ["slash backslash", "//\\elsewhere.example/x"],
  ["two slashes", "//elsewhere.example/x"],
  ["a tab between the slashes", "/\t/elsewhere.example/x"],
  ["a newline between the slashes", "/\n/elsewhere.example/x"],
  ["a dot segment", "/.//elsewhere.example/x"],
  ["a parent segment", "/..//elsewhere.example/x"],
  ["an old hash link", "/#/\\elsewhere.example/x"],
  ["a full address", "https://elsewhere.example/x"],
];

/** Where a browser goes with this Location, from the page that got it. */
function landsOn(location, from = `${SITE}/gate/`) {
  return new URL(location, from);
}

function context(request, env) {
  return { request, env, data: { opsEnv: env }, next: async () => new Response("ops app") };
}

/** Signed in with the local admin password, open /gate/?next=... */
async function visitGateSignedIn(next) {
  const cookie = `${AUTH_COOKIE_NAME}=${await createPasswordToken(PASSWORD)}`;
  const url = `${SITE}/gate/?next=${encodeURIComponent(next)}`;
  return middleware(context(new Request(url, { headers: { Cookie: cookie } }), passwordEnv));
}

/** The password form on /gate/, sending what it read from `?next=`. */
function submitPassword(next) {
  const request = new Request(`${SITE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD, next }),
  });
  return passwordSignIn(context(request, passwordEnv));
}

/** Google signs in an editor on the Users list. */
function fakeGoogleAndUsers() {
  const idToken = `x.${btoa(JSON.stringify({ email: "editor@gwenda.co.uk", email_verified: true })).replace(/=+$/, "")}.y`;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const json = (body) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
    if (url.host === "oauth2.googleapis.com") return json({ id_token: idToken });
    if (url.pathname === "/api/database/tables/all-tables/") {
      return json(
        ["Menu Sections", "Menu Items", "Ingredients", "Users"].map((name, i) => ({ id: i + 1, name, database_id: 7 })),
      );
    }
    if (url.pathname === "/api/database/rows/table/4/") {
      return json({ results: [{ Email: "editor@gwenda.co.uk", Active: true }], next: null });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
}

/** "Continue with Google" from /gate/?next=..., through Google, back to ops. */
async function signInWithGoogle(next) {
  const start = await login(
    context(new Request(`${SITE}/api/auth/login?next=${encodeURIComponent(next)}`), googleEnv),
  );
  const google = new URL(start.headers.get("Location"));
  assert.equal(google.host, "accounts.google.com");
  const oauthCookie = start.headers
    .getSetCookie()
    .find((header) => header.startsWith("gwenda_ops_oauth="));
  const oauth = parseCookies(oauthCookie.split(";")[0]).gwenda_ops_oauth;
  const callbackUrl = `${SITE}/api/auth/callback?code=abc&state=${encodeURIComponent(google.searchParams.get("state"))}`;
  return callback(
    context(new Request(callbackUrl, { headers: { Cookie: `gwenda_ops_oauth=${encodeURIComponent(oauth)}` } }), googleEnv),
  );
}

describe("sign-in: return path stays on this site", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    resetUsersCacheForTests();
    resetBaserowClientForTests();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it.each(notOnOps)("signed in, /gate/?next= with %s stays on ops", async (_what, next) => {
    const res = await visitGateSignedIn(next);
    assert.equal(res.status, 302);
    assert.equal(landsOn(res.headers.get("Location")).origin, SITE);
  });

  it.each(notOnOps)("the password form with %s sends you on within ops", async (_what, next) => {
    const res = await submitPassword(next);
    assert.equal(res.status, 200);
    const { redirect } = await res.json();
    assert.equal(landsOn(redirect).origin, SITE);
  });

  it.each(notOnOps)("Google sign-in with %s comes back to ops", async (_what, next) => {
    fakeGoogleAndUsers();
    const res = await signInWithGoogle(next);
    assert.equal(res.status, 302);
    assert.equal(landsOn(res.headers.get("Location"), `${SITE}/api/auth/callback`).origin, SITE);
  });

  it("still sends you back to the page you asked for, with its query", async () => {
    const res = await visitGateSignedIn("/menu/negroni/cost?from=list");
    assert.equal(res.headers.get("Location"), "/menu/negroni/cost?from=list");
    const form = await submitPassword("/events/schedule?week=2");
    assert.equal((await form.json()).redirect, "/events/schedule?week=2");
    fakeGoogleAndUsers();
    const google = await signInWithGoogle("/inventory/gin");
    assert.equal(google.headers.get("Location"), "/inventory/gin");
  });

  it("an old hash link still lands on its page", async () => {
    const res = await visitGateSignedIn("/#/menu");
    assert.equal(res.headers.get("Location"), "/menu");
  });

  it("never sends you back to the gate itself, and API paths go to their page", async () => {
    assert.equal((await visitGateSignedIn("/gate/?next=/menu")).headers.get("Location"), "/");
    assert.equal((await visitGateSignedIn("/api/menu")).headers.get("Location"), "/menu");
    assert.equal((await visitGateSignedIn("/api/auth/logout")).headers.get("Location"), "/");
  });
});
