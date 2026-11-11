/**
 * What resent form receipts (src/forms) rely on from the website module: the
 * public address of this environment's website, which ops asks to send the
 * receipt. Each environment's website reads its own submissions and signs
 * links with its own key, so asking another environment's site would fail.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { publicSiteOrigin } from "./site-urls.js";

test("production ops asks the live site; dev ops and a machine's ops ask the dev site", () => {
  assert.equal(publicSiteOrigin({ SITE_ENV: "production" }), "https://gwenda.co.uk");
  assert.equal(publicSiteOrigin({ SITE_ENV: "dev" }), "https://gwenda-web-dev.pages.dev");
  assert.equal(publicSiteOrigin({ SITE_ENV: "local" }), "https://gwenda-web-dev.pages.dev");
});
