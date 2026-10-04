/**
 * Use case: sign in to a website preview with Google, through ops
 * (shared/website-pass.js). Ops' side is ops/site/src/access/server/website-pass.test.js.
 */
import { describe, expect, it } from "vitest";
import { gate } from "./_middleware.js";
import { createWebsitePass } from "../../../shared/website-pass.js";

const HOST = "preview.gwenda-web-dev.pages.dev";
const env = {
  SITE_ENV: "dev",
  SITE_PREVIEW: "true",
  SITE_PASSWORD: "password",
  GATE_BYPASS_KEY: "gate-bypass-key",
};

function visit(path, headers = {}) {
  return gate({
    request: new Request(`https://${HOST}${path}`, { headers }),
    env,
    next: () => new Response("page"),
  });
}

describe("Sign in with Google on a website preview", () => {
  it("sends you to ops with the page to come back to", async () => {
    const res = await visit("/gate/google?next=%2Fmenu");
    const ops = new URL(res.headers.get("Location"));
    expect(ops.origin + ops.pathname).toBe(
      "https://gwenda-ops-dev.pages.dev/website-pass",
    );
    expect(ops.searchParams.get("return")).toBe(`https://${HOST}/menu`);
  });

  it("lets you in when you come back with a pass, and keeps you in", async () => {
    const pass = await createWebsitePass(env.GATE_BYPASS_KEY, HOST);
    const back = await visit(`/menu?x=1&pass=${pass}`);
    expect(back.status).toBe(302);
    expect(back.headers.get("Location")).toBe("/menu?x=1");
    const cookie = back.headers.get("Set-Cookie").split(";")[0];
    const page = await visit("/menu?x=1", { Cookie: cookie });
    expect(await page.text()).toBe("page");
  });

  it("sends a bad or borrowed pass to the password page", async () => {
    const other = await createWebsitePass(
      env.GATE_BYPASS_KEY,
      "feat-x.gwenda-web-dev.pages.dev",
    );
    for (const pass of ["nonsense", other]) {
      const res = await visit(`/menu?pass=${pass}`);
      expect(res.headers.get("Location")).toMatch(/^\/gate\?next=/);
      expect(res.headers.get("Set-Cookie")).toBe(null);
    }
  });
});
