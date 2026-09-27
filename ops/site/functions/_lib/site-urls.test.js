import assert from "node:assert/strict";
import { test } from "vitest";
import { buildEnvironment } from "./site-deploy.js";
import { runsOnMachine } from "./sanity.js";
import { siteUrls } from "./site-urls.js";

const prod = { SITE_ENV: "production" };
const hostedDev = { SITE_ENV: "dev" };
const machine = { SITE_ENV: "local" };

test("each ops belongs to one environment's website", () => {
  assert.equal(siteUrls(prod).live, "https://gwenda.co.uk");
  assert.equal(siteUrls(hostedDev).live, "https://gwenda-web-dev.pages.dev");
  assert.equal(siteUrls(machine).live, "http://localhost:4322");
});

test("dev ops builds the dev website; only ops on a machine can't build", () => {
  assert.equal(buildEnvironment(prod), "prod");
  assert.equal(buildEnvironment(hostedDev), "dev");
  assert.equal(runsOnMachine(hostedDev), false);
  assert.equal(runsOnMachine(machine), true);
  assert.equal(runsOnMachine(prod), false);
});
