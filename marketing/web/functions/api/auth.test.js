/**
 * POST /api/auth: the preview's password form. The right password gets the
 * gate cookie; anything else, however close, gets a 401 and no cookie.
 */
import { describe, expect, it } from "vitest";
import { onRequestPost as signIn } from "./auth.js";
import { matchesPassword } from "../_lib/site-auth.js";

const SITE = "https://preview.gwenda-web-dev.pages.dev";
const env = {
  SITE_ENV: "dev",
  SITE_PREVIEW: "true",
  SITE_PASSWORD: "canal-side",
};

function post(body) {
  return signIn({
    request: new Request(`${SITE}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  });
}

describe("POST /api/auth", () => {
  it("lets the right password in, with the gate cookie", async () => {
    const res = await post({ password: "canal-side", next: "/menu" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/menu" });
    expect(res.headers.get("Set-Cookie")).toMatch(/^gwenda_access=/);
  });

  it.each([
    ["a wrong one of the same length", "canal-sidf"],
    ["the start of it", "canal"],
    ["it with more on the end", "canal-side!"],
    ["it in capitals", "CANAL-SIDE"],
    ["nothing", ""],
    ["a number", 42],
    ["a list holding it", ["canal-side"]],
    ["an object", { toString: "canal-side" }],
    ["no password at all", undefined],
  ])("turns away %s", async (_what, password) => {
    const res = await post({ password, next: "/menu" });
    expect(res.status).toBe(401);
    expect(res.headers.get("Set-Cookie")).toBe(null);
  });
});

describe("matchesPassword", () => {
  it("is true only for the same password", async () => {
    expect(await matchesPassword("canal-side", "canal-side")).toBe(true);
    expect(await matchesPassword("canal-sidf", "canal-side")).toBe(false);
    expect(await matchesPassword("canal", "canal-side")).toBe(false);
    expect(await matchesPassword("canal-side!", "canal-side")).toBe(false);
  });

  it("is false for anything that isn't a password, or with none set", async () => {
    expect(await matchesPassword(undefined, "canal-side")).toBe(false);
    expect(await matchesPassword(["canal-side"], "canal-side")).toBe(false);
    expect(await matchesPassword("", "")).toBe(false);
    expect(await matchesPassword("canal-side", undefined)).toBe(false);
  });
});
