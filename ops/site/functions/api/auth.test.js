/**
 * POST /api/auth: ops' local admin password form. The right password gets
 * the sign-in cookie; anything else, however close, gets a 401 and no
 * cookie, and every attempt is checked the same way.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";
import { onRequestPost as signIn } from "./auth.js";

const SITE = "https://gwenda-ops-dev.pages.dev";
const PASSWORD = "canal-side";
const env = { SITE_ENV: "dev", OPS_LOCAL_ADMIN_PW: PASSWORD };

function post(body) {
  const request = new Request(`${SITE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return signIn({ request, env, data: { opsEnv: env } });
}

describe("sign-in: password check timing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lets the right password in, with the sign-in cookie", async () => {
    const res = await post({ password: PASSWORD, next: "/menu" });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, redirect: "/menu" });
    assert.match(res.headers.get("Set-Cookie"), /^gwenda_ops_access=/);
  });

  it.each([
    ["a wrong one of the same length", "canal-sidf"],
    ["the start of it", "canal"],
    ["it with more on the end", "canal-side!"],
    ["it in capitals", "CANAL-SIDE"],
    ["nothing", ""],
    ["a number", 42],
    ["a list holding it", [PASSWORD]],
    ["an object", { toString: PASSWORD }],
    ["no password at all", undefined],
  ])("turns away %s", async (_what, password) => {
    const res = await post({ password, next: "/menu" });
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("Set-Cookie"), null);
  });

  it("turns away a body that isn't a form", async () => {
    const res = await post(null);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("Set-Cookie"), null);
  });

  it("checks every password in full, however close or far it is", async () => {
    // Both sides are hashed and the hashes compared whole, so the time taken
    // doesn't depend on how much of the password was right.
    const digest = vi.spyOn(crypto.subtle, "digest");
    for (const password of ["canal-sidf", "c", "x".repeat(64), PASSWORD]) {
      digest.mockClear();
      await post({ password });
      const hashed = digest.mock.calls.map(([, data]) => new TextDecoder().decode(data));
      assert.ok(hashed.includes(password), `hashes what was typed: ${password}`);
      assert.ok(hashed.includes(PASSWORD), `hashes the password it is checked against`);
    }
  });
});
