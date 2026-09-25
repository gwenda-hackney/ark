import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sitePublishPhaseLabel } from "./site-publish-status.ts";

describe("sitePublishPhaseLabel", () => {
  it("names a queued preview rebuild", () => {
    assert.equal(
      sitePublishPhaseLabel({
        target: "preview",
        status: "queued",
        conclusion: null,
        completed: false,
      }),
      "Preview publish is queued.",
    );
  });

  it("names an in-progress rebuild", () => {
    assert.equal(
      sitePublishPhaseLabel({
        target: "preview",
        status: "in_progress",
        conclusion: null,
        completed: false,
      }),
      "Preview site is building.",
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
        target: "preview",
        status: "completed",
        conclusion: "failure",
        completed: true,
      }),
      "Preview publish failed.",
    );
  });
});
