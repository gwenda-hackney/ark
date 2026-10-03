/**
 * Use case: an editor signs in to a website preview with Google, through ops.
 * The ops middleware has already checked the Google session and the users list
 * (preview-signin.test.js covers that); this is the hand-back.
 */
import { describe, expect, it } from "vitest";
import { onRequestGet as websitePass } from "../../../functions/website-pass.js";
import { AUTH_COOKIE_NAME, createSessionToken } from "./auth.js";
import { verifyWebsitePass } from "../../../../../shared/website-pass.js";

const SECRET = "test-session-secret";
const KEY = "gate-bypass-key";

function env(overrides = {}) {
  return {
    SITE_ENV: "dev",
    GOOGLE_OAUTH_CLIENT_ID: "client-id",
    GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
    OPS_SESSION_SECRET: SECRET,
    GATE_BYPASS_KEY: KEY,
    ...overrides,
  };
}

async function visit(returnTo, { signedIn = true, ...overrides } = {}) {
  const headers = new Headers();
  if (signedIn) {
    headers.set("Cookie", `${AUTH_COOKIE_NAME}=${await createSessionToken(SECRET, "editor@gwenda.co.uk")}`);
  }
  const url = new URL("https://gwenda-ops-dev.pages.dev/website-pass");
  if (returnTo) url.searchParams.set("return", returnTo);
  return websitePass({ request: new Request(url, { headers }), env: env(overrides), data: {} });
}

describe("website pass from ops", () => {
  it("sends a signed-in editor back to the preview with a pass for it", async () => {
    const res = await visit("https://feat-x.gwenda-web-dev.pages.dev/whats-on?y=1");
    expect(res.status).toBe(302);
    const back = new URL(res.headers.get("Location"));
    expect(back.origin + back.pathname).toBe("https://feat-x.gwenda-web-dev.pages.dev/whats-on");
    expect(back.searchParams.get("y")).toBe("1");
    expect(await verifyWebsitePass(KEY, back.searchParams.get("pass"), back.host)).toBe(true);
  });

  it("refuses other sites, the other environment's previews, no session, or no key", async () => {
    expect((await visit("https://evil.example/")).status).toBe(400);
    expect((await visit("https://preview.gwenda-blue.pages.dev/")).status).toBe(400);
    expect((await visit("https://preview.gwenda-web-dev.pages.dev/", { signedIn: false })).status).toBe(401);
    expect((await visit("https://preview.gwenda-web-dev.pages.dev/", { GATE_BYPASS_KEY: "" })).status).toBe(503);
  });
});
