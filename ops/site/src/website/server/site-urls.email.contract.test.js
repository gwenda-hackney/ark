/**
 * What the weekly email (src/email) relies on from the website module: the
 * public address of this environment's website, where the email's links and
 * logo point. The email uses nothing else of site-urls.js, so a change here
 * that would send readers somewhere else fails in the website's own tests.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { publicSiteOrigin } from "./site-urls.js";

test("production's email points at the live site; dev's at the dev site, never localhost", () => {
  assert.equal(publicSiteOrigin({ SITE_ENV: "production" }), "https://gwenda.co.uk");
  assert.equal(publicSiteOrigin({ SITE_ENV: "dev" }), "https://gwenda-web-dev.pages.dev");
  assert.equal(publicSiteOrigin({ SITE_ENV: "local" }), "https://gwenda-web-dev.pages.dev");
});

test("it's an origin: https, no path, no trailing slash", () => {
  for (const SITE_ENV of ["production", "dev", "local"]) {
    const origin = publicSiteOrigin({ SITE_ENV });
    assert.equal(new URL(origin).origin, origin);
    assert.equal(new URL(origin).protocol, "https:");
  }
});
