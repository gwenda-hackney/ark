/**
 * The preview gate sends you back to the page you asked for (`next`), and
 * never off the site: whatever `next` says, the browser lands on this host.
 * Checked as a browser resolves the Location it gets.
 */
import { describe, expect, it } from "vitest";
import { gate } from "./_middleware.js";
import { onRequestPost as signIn } from "./api/auth.js";
import { AUTH_COOKIE_NAME, createAuthToken } from "./_lib/site-auth.js";

const HOST = "preview.gwenda-web-dev.pages.dev";
const SITE = `https://${HOST}`;
const env = {
  SITE_ENV: "dev",
  SITE_PREVIEW: "true",
  SITE_PASSWORD: "password",
  GATE_BYPASS_KEY: "gate-bypass-key",
};

async function signedIn() {
  return `${AUTH_COOKIE_NAME}=${await createAuthToken(env.SITE_PASSWORD)}`;
}

function visit(path, headers = {}) {
  return gate({
    request: new Request(`${SITE}${path}`, { headers }),
    env,
    next: () => new Response("page"),
  });
}

/** Where a browser goes with this Location, from the page that got it. */
function landsOn(location, from = `${SITE}/gate`) {
  return new URL(location, from);
}

/** `next` values that try to leave the site, as they arrive in a link. */
const offSite = [
  ["a backslash", "/%5Cevil.example/x"],
  ["two backslashes", "/%5C%5Cevil.example/x"],
  ["slash backslash", "/%2F%5Cevil.example/x"],
  ["two slashes", "//evil.example/x"],
  ["a tab between the slashes", "/%09/evil.example/x"],
  ["a dot segment", "/.//evil.example/x"],
  ["a parent segment", "/..//evil.example/x"],
  ["a full address", "https://evil.example/x"],
  ["a script", "javascript:alert(1)"],
];

describe("the gate's `next` never leaves the site", () => {
  it.each(offSite)(
    "signed in, /gate?next= with %s stays on the site",
    async (_what, next) => {
      const res = await visit(`/gate?next=${next}`, {
        Cookie: await signedIn(),
      });
      expect(res.status).toBe(302);
      expect(landsOn(res.headers.get("Location")).origin).toBe(SITE);
    },
  );

  it.each(offSite)(
    "the access link to /gate?next= with %s stays on the site",
    async (_what, next) => {
      const res = await visit(
        `/gate?next=${next}&access=${env.GATE_BYPASS_KEY}`,
      );
      expect(res.status).toBe(302);
      expect(landsOn(res.headers.get("Location")).origin).toBe(SITE);
    },
  );

  it("the access link on a page whose path starts with two slashes stays on the site", async () => {
    const res = await visit(`//evil.example/x?access=${env.GATE_BYPASS_KEY}`);
    expect(res.status).toBe(302);
    expect(landsOn(res.headers.get("Location"), `${SITE}/`).origin).toBe(SITE);
  });

  it.each(offSite)(
    "Sign in with Google with %s comes back to the site",
    async (_what, next) => {
      const res = await visit(`/gate/google?next=${next}`);
      const ops = new URL(res.headers.get("Location"));
      expect(new URL(ops.searchParams.get("return")).origin).toBe(SITE);
    },
  );

  it.each(offSite)(
    "the password form with %s sends you on within the site",
    async (_what, next) => {
      const res = await signIn({
        request: new Request(`${SITE}/api/auth`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            password: env.SITE_PASSWORD,
            next: decodeURIComponent(next),
          }),
        }),
        env,
      });
      expect(res.status).toBe(200);
      const { redirect } = await res.json();
      expect(landsOn(redirect).origin).toBe(SITE);
    },
  );

  it("still sends you back to the page you asked for, with its query and anchor", async () => {
    const res = await visit(
      `/gate?next=${encodeURIComponent("/menu?x=1#drinks")}`,
      {
        Cookie: await signedIn(),
      },
    );
    expect(res.headers.get("Location")).toBe("/menu?x=1#drinks");
  });

  it("never sends you back to the gate itself", async () => {
    const res = await visit(
      `/gate?next=${encodeURIComponent("/gate?next=/menu")}`,
      {
        Cookie: await signedIn(),
      },
    );
    expect(res.headers.get("Location")).toBe("/");
  });
});
