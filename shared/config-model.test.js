import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { environmentOf, isLocalMachine, valuesFromRecords } from "./config-model.js";

const record = (name, value, env = "all", service = "all") => ({ name, value, env, service });

describe("environmentOf", () => {
  it("maps SITE_ENV", () => {
    assert.equal(environmentOf({ SITE_ENV: "local" }), "dev");
    assert.equal(environmentOf({ SITE_ENV: "dev" }), "dev");
    assert.equal(isLocalMachine({ SITE_ENV: "local" }), true);
    assert.equal(isLocalMachine({ SITE_ENV: "dev" }), false);
    assert.equal(environmentOf({ SITE_ENV: "production" }), "production");
  });

  it("refuses to guess when SITE_ENV is missing", () => {
    // Defaulting to production let dev data reach the production calendar.
    assert.throws(() => environmentOf({}), /SITE_ENV is not set/);
    // The preview build flag is not an environment either.
    assert.throws(() => environmentOf({ PUBLIC_IS_PREVIEW: "true" }), /SITE_ENV is not set/);
  });
});

describe("valuesFromRecords", () => {
  const records = [
    record("forms.notify_email", "all@x", "all", "all"),
    record("forms.notify_email", "web@x", "all", "web"),
    record("forms.notify_email", "local-any@x", "local", "all"),
    record("forms.notify_email", "local-web@x", "local", "web"),
    record("web.origin", "https://gwenda.co.uk", "production", "ops"),
  ];

  it("picks the most specific record: env beats service beats all", () => {
    assert.equal(valuesFromRecords(records, "local", "web")["forms.notify_email"], "local-web@x");
    assert.equal(valuesFromRecords(records, "local", "ops")["forms.notify_email"], "local-any@x");
    assert.equal(valuesFromRecords(records, "production", "web")["forms.notify_email"], "web@x");
    assert.equal(valuesFromRecords(records, "production", "ops")["forms.notify_email"], "all@x");
  });

  it("never leaks another env's or service's records", () => {
    assert.equal(valuesFromRecords(records, "local", "ops")["web.origin"], undefined);
    assert.equal(valuesFromRecords(records, "production", "web")["web.origin"], undefined);
    assert.equal(valuesFromRecords(records, "production", "ops")["web.origin"], "https://gwenda.co.uk");
  });
});
