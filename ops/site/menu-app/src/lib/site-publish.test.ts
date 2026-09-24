import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sitePublishPhaseLabel } from "./site-publish-status.ts";

describe("sitePublishPhaseLabel", () => {
  it("names a queued staging rebuild", () => {
    assert.equal(
      sitePublishPhaseLabel({
        target: "staging",
        status: "queued",
        conclusion: null,
        completed: false,
      }),
      "Staging publish is queued.",
    );
  });

  it("names an in-progress rebuild", () => {
    assert.equal(
      sitePublishPhaseLabel({
        target: "staging",
        status: "in_progress",
        conclusion: null,
        completed: false,
      }),
      "Staging site is building.",
    );
  });

  it("names a finished production publish", () => {
    assert.equal(
      sitePublishPhaseLabel({
        target: "production",
        status: "completed",
        conclusion: "success",
        completed: true,
      }),
      "Production site is published.",
    );
  });

  it("names a failed publish", () => {
    assert.equal(
      sitePublishPhaseLabel({
        target: "staging",
        status: "completed",
        conclusion: "failure",
        completed: true,
      }),
      "Staging publish failed.",
    );
  });
});
