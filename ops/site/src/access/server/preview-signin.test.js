/**
 * Use case: an editor signs in to a dev ops branch preview with Google.
 * Driven through the real auth handlers and middleware; Google and Baserow
 * are faked.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";
import { onRequest as middleware } from "../../../functions/_middleware.js";
import { onRequestGet as callback } from "../../../functions/api/auth/callback.js";
import { onRequestGet as login } from "../../../functions/api/auth/login.js";
import { onRequestGet as logout } from "../../../functions/api/auth/logout.js";
import { AUTH_COOKIE_NAME, parseCookies, verifySessionToken } from "./auth.js";
import { resetBaserowClientForTests } from "../../../../../shared/baserow.js";
import { resetUsersCacheForTests } from "../../users/server/user-store.js";

const SECRET = "test-session-secret";
const MAIN = "https://gwenda-ops-dev.pages.dev";
const PREVIEW = "https://feat-26-instagram.gwenda-ops-dev.pages.dev";

function devEnv(overrides = {}) {
  return {
    SITE_ENV: "dev",
    GOOGLE_OAUTH_CLIENT_ID: "client-id",
    GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
    OPS_SESSION_SECRET: SECRET,
    BASEROW_API_KEY: "baserow-token",
    ...overrides,
  };
}

/** Google signs in `email`; Baserow Users holds `users` ({ Email, Active }). */
function fakeWorld({ email = "editor@gwenda.co.uk", users = [{ Email: "editor@gwenda.co.uk", Active: true }] } = {}) {
  const world = { email, users };
  const idToken = (address) =>
    `x.${btoa(JSON.stringify({ email: address, email_verified: true })).replace(/=+$/, "")}.y`;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const json = (body) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
    if (url.host === "oauth2.googleapis.com") return json({ id_token: idToken(world.email) });
    if (url.pathname === "/api/database/tables/all-tables/") {
      return json(
        ["Menu Sections", "Menu Items", "Ingredients", "Users"].map((name, i) => ({ id: i + 1, name, database_id: 7 })),
      );
    }
    if (url.pathname === "/api/database/rows/table/4/") return json({ results: world.users, next: null });
    throw new Error(`Unexpected fetch ${url}`);
  };
  return world;
}

function get(url, env, { cookie = "", headers = {} } = {}) {
  const request = new Request(url, { headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers } });
  return { request, env, data: { opsEnv: env }, next: async () => new Response("ops app") };
}

/** The Set-Cookie header for `name` (last one wins, as in a browser). */
function setCookie(response, name) {
  return response.headers.getSetCookie().filter((header) => header.startsWith(`${name}=`)).at(-1) || "";
}

function cookieValue(header, name) {
  return parseCookies(header.split(";")[0])[name] || "";
}

/** Runs login from `startUrl` through Google to the callback on the main dev host. */
async function signInThroughGoogle(startUrl, env) {
  let res = await login(get(startUrl, env));
  let location = res.headers.get("Location");
  if (location.startsWith(`${MAIN}/api/auth/login`)) {
    res = await login(get(location, env));
    location = res.headers.get("Location");
  }
  const google = new URL(location);
  assert.equal(google.host, "accounts.google.com");
  const oauth = cookieValue(setCookie(res, "gwenda_ops_oauth"), "gwenda_ops_oauth");
  const callbackUrl = `${MAIN}/api/auth/callback?code=abc&state=${encodeURIComponent(google.searchParams.get("state"))}`;
  return callback(get(callbackUrl, env, { cookie: `gwenda_ops_oauth=${encodeURIComponent(oauth)}` }));
}

describe("signing in to a dev ops branch preview", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    resetUsersCacheForTests();
    resetBaserowClientForTests();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("goes via the main dev host, comes back to the page asked for, and the preview accepts the session", async () => {
    const env = devEnv();
    fakeWorld();

    const start = await login(get(`${PREVIEW}/api/auth/login?next=/events`, env));
    const toMain = new URL(start.headers.get("Location"));
    assert.equal(toMain.origin, MAIN);
    assert.equal(toMain.searchParams.get("return_to"), PREVIEW);

    const back = await signInThroughGoogle(`${PREVIEW}/api/auth/login?next=/events`, env);
    assert.equal(back.headers.get("Location"), `${PREVIEW}/events`);
    const cookie = setCookie(back, AUTH_COOKIE_NAME);
    assert.match(cookie, /; Domain=gwenda-ops-dev\.pages\.dev/);
    const session = cookieValue(cookie, AUTH_COOKIE_NAME);
    assert.equal(await verifySessionToken(SECRET, session), "editor@gwenda.co.uk");

    const page = await middleware(get(`${PREVIEW}/events`, env, { cookie: `${AUTH_COOKIE_NAME}=${session}` }));
    assert.equal(await page.text(), "ops app");
  });

  it("signs in on the main dev host as before, and the session also works on previews", async () => {
    const env = devEnv();
    fakeWorld();
    const res = await signInThroughGoogle(`${MAIN}/api/auth/login?next=/menu`, env);
    assert.equal(res.headers.get("Location"), "/menu");
    assert.match(setCookie(res, AUTH_COOKIE_NAME), /; Domain=gwenda-ops-dev\.pages\.dev/);
  });

  it("turns away someone taken off the Users list, on the preview too", async () => {
    const env = devEnv();
    const world = fakeWorld();
    const back = await signInThroughGoogle(`${PREVIEW}/api/auth/login`, env);
    const session = cookieValue(setCookie(back, AUTH_COOKIE_NAME), AUTH_COOKIE_NAME);
    world.users = [{ Email: "editor@gwenda.co.uk", Active: false }];
    resetUsersCacheForTests();
    const page = await middleware(get(`${PREVIEW}/events`, env, { cookie: `${AUTH_COOKIE_NAME}=${session}` }));
    assert.equal(page.status, 403);
  });

  it("signing out clears the shared dev session", async () => {
    const env = devEnv();
    const res = await logout(get(`${PREVIEW}/api/auth/logout`, env));
    const cleared = res.headers.getSetCookie().filter((header) => header.startsWith(`${AUTH_COOKIE_NAME}=;`));
    assert.ok(cleared.some((header) => /; Domain=gwenda-ops-dev\.pages\.dev/.test(header)));
    assert.ok(cleared.every((header) => /Max-Age=0/.test(header)));
  });

  for (const [label, returnTo] of [
    ["another site", "https://evil.example"],
    ["the production ops project", "https://feat-x.gwenda-ops.pages.dev"],
    ["a lookalike host", "https://feat-x.gwenda-ops-dev.pages.dev.evil.example"],
    ["plain http", "http://feat-x.gwenda-ops-dev.pages.dev"],
    ["a path smuggled in", "https://feat-x.gwenda-ops-dev.pages.dev/steal"],
  ]) {
    it(`won't send anyone back to ${label}`, async () => {
      const env = devEnv();
      fakeWorld();
      const res = await signInThroughGoogle(
        `${MAIN}/api/auth/login?next=/events&return_to=${encodeURIComponent(returnTo)}`,
        env,
      );
      assert.equal(res.headers.get("Location"), "/events");
    });
  }

  it("does none of this in production: no bounce to dev, host-only cookie, nothing sent elsewhere", async () => {
    const env = devEnv({ SITE_ENV: "production" });
    fakeWorld();
    const start = await login(get(`${PREVIEW}/api/auth/login?next=/events`, env));
    assert.equal(new URL(start.headers.get("Location")).host, "accounts.google.com");

    const res = await signInThroughGoogle(
      `${MAIN}/api/auth/login?next=/events&return_to=${encodeURIComponent(PREVIEW)}`,
      env,
    );
    assert.equal(res.headers.get("Location"), "/events");
    assert.doesNotMatch(setCookie(res, AUTH_COOKIE_NAME), /Domain=/);
  });

  it("can't be talked into the shared cookie with X-Forwarded-Host", async () => {
    const env = devEnv();
    const res = await logout(
      get("https://gwenda-ops.pages.dev/api/auth/logout", env, {
        headers: { "X-Forwarded-Host": new URL(PREVIEW).host },
      }),
    );
    assert.ok(res.headers.getSetCookie().every((header) => !/Domain=/.test(header)));
  });
});
