import assert from "node:assert/strict";
import test from "node:test";
import {
  DEV_SANITY_PROJECT_ID,
  REAL_SANITY_PROJECT_ID,
  assertSanityWritable,
  canChangeWebsite,
} from "./sanity.js";

const local = (projectId) => ({ SITE_ENV: "local", SANITY_PROJECT_ID: projectId });

test("local ops writes and updates the website only in the Gwenda Dev project", () => {
  assert.doesNotThrow(() => assertSanityWritable(local(DEV_SANITY_PROJECT_ID)));
  assert.equal(canChangeWebsite(local(DEV_SANITY_PROJECT_ID)), true);

  assert.throws(() => assertSanityWritable(local(REAL_SANITY_PROJECT_ID)), { status: 403 });
  // No project set means the real default: refused.
  assert.throws(() => assertSanityWritable({ SITE_ENV: "local" }), { status: 403 });
  assert.equal(canChangeWebsite(local(REAL_SANITY_PROJECT_ID)), false);
});

test("hosted ops writes the real project", () => {
  const hosted = { SITE_ENV: "production", SANITY_PROJECT_ID: REAL_SANITY_PROJECT_ID };
  assert.doesNotThrow(() => assertSanityWritable(hosted));
  assert.equal(canChangeWebsite(hosted), true);
});
