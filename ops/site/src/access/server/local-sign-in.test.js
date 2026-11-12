/**
 * Local sign-in: `npm run ops:dev` signs the developer in as themselves, no
 * Google. Only a developer's machine on the dev copies honours it (SITE_ENV
 * local, not `ops:prod`), and the ops users list still decides who gets in.
 * Everywhere else the same binding does nothing: Google sign-in as before.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";
import { protect as middleware } from "../../../functions/_middleware.js";
import { onRequestGet as login } from "../../../functions/api/auth/login.js";
import { onRequestGet as logout } from "../../../functions/api/auth/logout.js";
import { memoryUserRepository } from "../../users/server/adapters/memory-users.js";
import { resetUsersCacheForTests } from "../../users/server/user-store.js";

const SITE = "http://localhost:5174";
const DEVELOPER = "developer@gwenda.co.uk";

const google = {
  GOOGLE_OAUTH_CLIENT_ID: "client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
  OPS_SESSION_SECRET: "test-session-secret",
};

/** What `npm run ops:dev` binds, with the users list in memory. */
function machine(overrides = {}, users = [{ email: DEVELOPER, active: true }]) {
  return {
    ...google,
    SITE_ENV: "local",
    OPS_LOCAL_SIGN_IN: DEVELOPER,
    usersRepository: memoryUserRepository(users),
    ...overrides,
  };
}

function open(path, env) {
  const request = new Request(`${SITE}${path}`);
  return middleware({ request, env, data: { opsEnv: env }, next: async () => new Response("ops app") });
}

describe("local sign-in", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    resetUsersCacheForTests();
    // Nothing here may reach Google or a database.
    globalThis.fetch = async (input) => {
      throw new Error(`Unexpected fetch ${typeof input === "string" ? input : input.url}`);
    };
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("opens the app on a developer's machine without signing in", async () => {
    const res = await open("/menu", machine());
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "ops app");
  });

  it("answers API calls as the developer", async () => {
    const res = await open("/api/menu", machine());
    assert.equal(res.status, 200);
  });

  it("sends the gate straight on to the page asked for", async () => {
    const res = await open("/gate/?next=%2Fevents", machine());
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("Location"), "/events");
  });

  it("skips Google when Continue with Google is followed", async () => {
    const env = machine();
    const res = await login({ request: new Request(`${SITE}/api/auth/login?next=%2Fmenu`), env, data: { opsEnv: env } });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("Location"), "/menu");
  });

  it("sign out comes back to the app instead of looping", async () => {
    const env = machine();
    const out = await logout({ request: new Request(`${SITE}/api/auth/logout`), env, data: { opsEnv: env } });
    assert.equal(out.status, 302);
    const gate = await open(out.headers.get("Location"), env);
    assert.equal(gate.status, 302);
    assert.equal(gate.headers.get("Location"), "/");
    assert.equal((await open("/", env)).status, 200);
  });

  describe("refuses an email that isn't on the ops users list", () => {
    const outsider = () => machine({}, [{ email: "someone-else@gwenda.co.uk", active: true }]);

    it("for the app, with a page that says which email and no sign-out loop", async () => {
      const res = await open("/menu", outsider());
      assert.equal(res.status, 403);
      const body = await res.text();
      assert.match(body, /Not on the ops users list/);
      assert.match(body, /developer@gwenda\.co\.uk/);
      assert.doesNotMatch(body, /\/api\/auth\/logout/);
    });

    it("for the API, with the usual code", async () => {
      const res = await open("/api/menu", outsider());
      assert.equal(res.status, 403);
      assert.equal((await res.json()).code, "not_ops_user");
    });

    it("when the user is inactive", async () => {
      const res = await open("/menu", machine({}, [{ email: DEVELOPER, active: false }]));
      assert.equal(res.status, 403);
    });
  });

  describe.each([
    ["hosted production", { SITE_ENV: "production" }],
    ["hosted dev", { SITE_ENV: "dev" }],
    ["production by its short name", { SITE_ENV: "prod" }],
    ["a runtime with no SITE_ENV", { SITE_ENV: undefined }],
    ["ops:prod (a local copy on live data)", { SITE_ENV: "production", OPS_LOCAL_LIVE: "1" }],
    ["a local machine flagged live", { SITE_ENV: "local", OPS_LOCAL_LIVE: "1" }],
  ])("ignores the binding on %s", (_where, overrides) => {
    it("sends the app to the gate (Google sign-in)", async () => {
      const res = await open("/menu", machine(overrides));
      assert.equal(res.status, 302);
      assert.equal(res.headers.get("Location"), "/gate/?next=%2Fmenu");
    });

    it("answers the API with sign-in required", async () => {
      const res = await open("/api/menu", machine(overrides));
      assert.equal(res.status, 401);
    });
  });
});
