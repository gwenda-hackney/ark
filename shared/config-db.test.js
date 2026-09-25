import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { environmentOf, isLocalMachine, valuesFromRows } from "./config-db.js";

const row = (Name, Value, Env = "all", Service = "all") => ({
  Name,
  Value,
  Env: { value: Env },
  Service: { value: Service },
});

describe("environmentOf", () => {
  it("maps SITE_ENV and the staging flag", () => {
    assert.equal(environmentOf({ SITE_ENV: "local" }), "dev");
    assert.equal(environmentOf({ SITE_ENV: "dev" }), "dev");
    assert.equal(isLocalMachine({ SITE_ENV: "local" }), true);
    assert.equal(isLocalMachine({ SITE_ENV: "dev" }), false);
    assert.equal(environmentOf({ SITE_ENV: "staging" }), "staging");
    assert.equal(environmentOf({ PUBLIC_IS_STAGING: "true" }), "staging");
    assert.equal(environmentOf({ SITE_ENV: "production" }), "production");
    assert.equal(environmentOf({}), "production");
  });
});

describe("valuesFromRows", () => {
  const rows = [
    row("forms.notify_email", "all@x", "all", "all"),
    row("forms.notify_email", "web@x", "all", "web"),
    row("forms.notify_email", "local-any@x", "local", "all"),
    row("forms.notify_email", "local-web@x", "local", "web"),
    row("web.origin", "https://gwenda.co.uk", "production", "ops"),
  ];

  it("picks the most specific row: env beats service beats all", () => {
    assert.equal(valuesFromRows(rows, "local", "web")["forms.notify_email"], "local-web@x");
    assert.equal(valuesFromRows(rows, "local", "ops")["forms.notify_email"], "local-any@x");
    assert.equal(valuesFromRows(rows, "production", "web")["forms.notify_email"], "web@x");
    assert.equal(valuesFromRows(rows, "production", "ops")["forms.notify_email"], "all@x");
  });

  it("never leaks another env's or service's rows", () => {
    assert.equal(valuesFromRows(rows, "local", "ops")["web.origin"], undefined);
    assert.equal(valuesFromRows(rows, "production", "web")["web.origin"], undefined);
    assert.equal(valuesFromRows(rows, "production", "ops")["web.origin"], "https://gwenda.co.uk");
  });
});
