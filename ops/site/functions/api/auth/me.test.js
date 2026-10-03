/**
 * /api/auth/me sits under /api/auth, which the middleware leaves open, so it
 * checks the ops users list itself: someone taken off it is signed out (#151).
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";
import { onRequestGet as me } from "./me.js";
import { AUTH_COOKIE_NAME, createSessionToken } from "../../../src/access/server/auth.js";
import { resetBaserowClientForTests } from "../../../../../shared/baserow.js";
import { resetUsersCacheForTests } from "../../../src/users/server/user-store.js";

const SECRET = "test-session-secret";
const env = {
  SITE_ENV: "dev",
  GOOGLE_OAUTH_CLIENT_ID: "client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
  OPS_SESSION_SECRET: SECRET,
  BASEROW_API_KEY: "baserow-token",
};

/** Baserow Users holds `users` ({ Email, Active }). */
function fakeBaserow(users) {
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const json = (body) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
    if (url.pathname === "/api/database/tables/all-tables/") {
      return json(
        ["Menu Sections", "Menu Items", "Ingredients", "Users"].map((name, i) => ({ id: i + 1, name, database_id: 7 })),
      );
    }
    if (url.pathname === "/api/database/rows/table/4/") return json({ results: users, next: null });
    return json({ results: [], next: null });
  };
}

async function askAs(email) {
  const token = await createSessionToken(SECRET, email);
  const request = new Request("https://gwenda-ops-dev.pages.dev/api/auth/me", {
    headers: { Cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}` },
  });
  return me({ request, env, data: { opsEnv: env } });
}

describe("/api/auth/me", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    resetUsersCacheForTests();
    resetBaserowClientForTests();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("answers for someone on the ops users list", async () => {
    fakeBaserow([{ Email: "editor@gwenda.co.uk", Active: true }]);
    const res = await askAs("editor@gwenda.co.uk");
    assert.equal(res.status, 200);
    assert.equal((await res.json()).email, "editor@gwenda.co.uk");
  });

  it("is 403 for someone taken off the list mid-session", async () => {
    fakeBaserow([{ Email: "someone-else@gwenda.co.uk", Active: true }]);
    const res = await askAs("editor@gwenda.co.uk");
    assert.equal(res.status, 403);
    assert.match((await res.json()).error, /not on the ops users list/);
  });

  it("is 403 for someone switched to inactive", async () => {
    fakeBaserow([{ Email: "editor@gwenda.co.uk", Active: false }]);
    assert.equal((await askAs("editor@gwenda.co.uk")).status, 403);
  });

  it("is 401 without a session", async () => {
    fakeBaserow([]);
    const res = await me({ request: new Request("https://gwenda-ops-dev.pages.dev/api/auth/me"), env, data: { opsEnv: env } });
    assert.equal(res.status, 401);
  });
});
