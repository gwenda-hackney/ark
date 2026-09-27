/**
 * Use case: an editor signs in to a dev ops branch preview with Google.
 * Driven through the real auth handlers; Google and Baserow are faked.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { onRequestGet as callback } from "../api/auth/callback.js";
import { onRequestGet as handoff } from "../api/auth/handoff.js";
import { onRequestGet as login } from "../api/auth/login.js";
import { AUTH_COOKIE_NAME, createHandoffToken, parseCookies, verifySessionToken } from "./auth.js";
import { resetBaserowClientForTests } from "./baserow.js";
import { resetUsersCacheForTests } from "./user-store.js";

const SECRET = "test-session-secret";
const MAIN = "https://gwenda-ops-dev.pages.dev";
const PREVIEW = "https://feat-26-instagram.gwenda-ops-dev.pages.dev";
const OTHER_PREVIEW = "https://fix-43-overlap.gwenda-ops-dev.pages.dev";

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
  const world = { email, users, calls: [] };
  const idToken = (address) =>
    `x.${btoa(JSON.stringify({ email: address, email_verified: true })).replace(/=+$/, "")}.y`;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    world.calls.push(url.host + url.pathname);
    const json = (body) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
    if (url.host === "oauth2.googleapis.com") return json({ id_token: idToken(world.email) });
    if (url.pathname === "/api/database/tables/all-tables/") {
      return json(
        ["Menu Sections", "Menu Items", "Ingredients", "Users"].map((name, i) => ({
          id: i + 1,
          name,
          database_id: 7,
        })),
      );
    }
    if (url.pathname === "/api/database/rows/table/4/") return json({ results: world.users, next: null });
    throw new Error(`Unexpected fetch ${url}`);
  };
  return world;
}

function get(url, env, { cookie = "", headers = {} } = {}) {
  const request = new Request(url, { headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers } });
  return { request, env, data: { opsEnv: env } };
}

function cookieValue(response, name) {
  for (const header of response.headers.getSetCookie()) {
    const value = parseCookies(header.split(";")[0])[name];
    if (value) return value;
  }
  return "";
}

/** Runs login on `startUrl` through to Google's callback on the main host. */
async function signInThroughGoogle(startUrl, env) {
  let res = await login(get(startUrl, env));
  let location = res.headers.get("Location");
  if (location.startsWith(`${MAIN}/api/auth/login`)) {
    res = await login(get(location, env));
    location = res.headers.get("Location");
  }
  const google = new URL(location);
  assert.equal(google.host, "accounts.google.com");
  const oauthCookie = cookieValue(res, "gwenda_ops_oauth");
  const callbackUrl = `${MAIN}/api/auth/callback?code=abc&state=${encodeURIComponent(google.searchParams.get("state"))}`;
  return callback(get(callbackUrl, env, { cookie: `gwenda_ops_oauth=${encodeURIComponent(oauthCookie)}` }));
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

  it("goes via the main dev host and lands signed in on the preview page asked for", async () => {
    const env = devEnv();
    fakeWorld();

    const start = await login(get(`${PREVIEW}/api/auth/login?next=/events`, env));
    const toMain = new URL(start.headers.get("Location"));
    assert.equal(toMain.origin, MAIN);
    assert.equal(toMain.searchParams.get("return_to"), PREVIEW);
    assert.equal(toMain.searchParams.get("next"), "/events");

    const back = await signInThroughGoogle(`${PREVIEW}/api/auth/login?next=/events`, env);
    const handoffUrl = new URL(back.headers.get("Location"));
    assert.equal(handoffUrl.origin + handoffUrl.pathname, `${PREVIEW}/api/auth/handoff`);
    assert.equal(handoffUrl.searchParams.get("next"), "/events");

    const landed = await handoff(get(handoffUrl.toString(), env));
    assert.equal(landed.status, 302);
    assert.equal(landed.headers.get("Location"), "/events");
    const session = cookieValue(landed, AUTH_COOKIE_NAME);
    assert.equal(await verifySessionToken(SECRET, session), "editor@gwenda.co.uk");
  });

  it("signs in on the main dev host as before when there is no preview", async () => {
    const env = devEnv();
    fakeWorld();
    const res = await signInThroughGoogle(`${MAIN}/api/auth/login?next=/menu`, env);
    assert.equal(res.headers.get("Location"), "/menu");
    assert.ok(cookieValue(res, AUTH_COOKIE_NAME));
  });

  it("refuses someone who isn't an active ops user, at the preview too", async () => {
    const env = devEnv();
    const world = fakeWorld();
    const back = await signInThroughGoogle(`${PREVIEW}/api/auth/login`, env);
    world.users = [{ Email: "editor@gwenda.co.uk", Active: false }];
    resetUsersCacheForTests();
    const landed = await handoff(get(back.headers.get("Location"), env));
    assert.equal(landed.status, 403);
    assert.equal(cookieValue(landed, AUTH_COOKIE_NAME), "");
  });

  it("won't use a hand-off token on a different preview", async () => {
    const env = devEnv();
    fakeWorld();
    const back = await signInThroughGoogle(`${PREVIEW}/api/auth/login`, env);
    const stolen = new URL(back.headers.get("Location"));
    const replay = await handoff(get(`${OTHER_PREVIEW}/api/auth/handoff${stolen.search}`, env));
    assert.match(replay.headers.get("Location"), /^\/gate\/\?error=/);
    assert.equal(cookieValue(replay, AUTH_COOKIE_NAME), "");
  });

  it("won't use an expired or altered hand-off token", async () => {
    const env = devEnv();
    fakeWorld();
    const expired = await createHandoffToken(SECRET, "editor@gwenda.co.uk", PREVIEW, -1);
    const res = await handoff(get(`${PREVIEW}/api/auth/handoff?token=${encodeURIComponent(expired)}`, env));
    assert.match(res.headers.get("Location"), /^\/gate\/\?error=/);

    const good = await createHandoffToken(SECRET, "editor@gwenda.co.uk", PREVIEW);
    // Someone else's email in the payload, with the genuine token's signature.
    const forged = await createHandoffToken("another-secret", "intruder@example.com", PREVIEW);
    const altered = `${forged.split(".")[0]}.${good.split(".")[1]}`;
    const res2 = await handoff(get(`${PREVIEW}/api/auth/handoff?token=${encodeURIComponent(altered)}`, env));
    assert.match(res2.headers.get("Location"), /^\/gate\/\?error=/);
  });

  for (const [label, returnTo] of [
    ["another site", "https://evil.example"],
    ["the production ops project", "https://feat-x.gwenda-ops.pages.dev"],
    ["a lookalike host", "https://feat-x.gwenda-ops-dev.pages.dev.evil.example"],
    ["plain http", "http://feat-x.gwenda-ops-dev.pages.dev"],
    ["a path smuggled in", "https://feat-x.gwenda-ops-dev.pages.dev/steal"],
  ]) {
    it(`ignores a return_to pointing at ${label}`, async () => {
      const env = devEnv();
      fakeWorld();
      const res = await signInThroughGoogle(
        `${MAIN}/api/auth/login?next=/events&return_to=${encodeURIComponent(returnTo)}`,
        env,
      );
      assert.equal(res.headers.get("Location"), "/events");
    });
  }

  it("does nothing of this in production: no bounce to dev, and no hand-off route", async () => {
    const env = devEnv({ SITE_ENV: "production" });
    fakeWorld();
    const start = await login(get(`${PREVIEW}/api/auth/login?next=/events`, env));
    assert.equal(new URL(start.headers.get("Location")).host, "accounts.google.com");

    const token = await createHandoffToken(SECRET, "editor@gwenda.co.uk", PREVIEW);
    const res = await handoff(get(`${PREVIEW}/api/auth/handoff?token=${encodeURIComponent(token)}`, env));
    assert.equal(res.status, 404);
  });

  it("can't be tricked into treating the main host as a preview with X-Forwarded-Host", async () => {
    const env = devEnv();
    fakeWorld();
    const token = await createHandoffToken(SECRET, "editor@gwenda.co.uk", PREVIEW);
    const res = await handoff(
      get(`${MAIN}/api/auth/handoff?token=${encodeURIComponent(token)}`, env, {
        headers: { "X-Forwarded-Host": new URL(PREVIEW).host },
      }),
    );
    assert.equal(res.status, 404);
  });
});
