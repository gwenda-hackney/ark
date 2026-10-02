import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { browserEnvironment, normalizeClientError } from "./client-error.ts";

describe("normalizeClientError", () => {
  it("reads Error instances", () => {
    const err = new Error("boom");
    err.name = "TypeError";
    const report = normalizeClientError(err);
    assert.equal(report.message, "boom");
    assert.equal(report.name, "TypeError");
    assert.match(report.stack, /boom/);
  });

  it("reads plain strings", () => {
    assert.deepEqual(normalizeClientError("  nope  "), {
      message: "nope",
      stack: "",
      name: "Error",
    });
  });

  it("reads message-shaped objects", () => {
    const report = normalizeClientError({
      message: "each_key_duplicate",
      stack: "at EventsPage",
      name: "Error",
    });
    assert.equal(report.message, "each_key_duplicate");
    assert.equal(report.stack, "at EventsPage");
  });
});

describe("browserEnvironment", () => {
  it("reports from production and dev ops, and from dev's branch previews", () => {
    assert.equal(browserEnvironment("operations.gwenda.co.uk"), "production");
    assert.equal(browserEnvironment("gwenda-ops.pages.dev"), "production");
    assert.equal(browserEnvironment("gwenda-ops-dev.pages.dev"), "dev");
    assert.equal(browserEnvironment("feat-x.gwenda-ops-dev.pages.dev"), "dev");
  });

  it("reports nothing from a developer's machine or an unknown host", () => {
    assert.equal(browserEnvironment("localhost:5174"), "");
    assert.equal(browserEnvironment("evil-gwenda-ops-dev.pages.dev"), "");
  });
});
