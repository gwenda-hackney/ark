import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eventHeaderFlag } from "./event-header-status.ts";

describe("eventHeaderFlag", () => {
  it("puts unsaved edits ahead of everything", () => {
    assert.deepEqual(eventHeaderFlag({ preview: "current", live: "current" }, true), {
      label: "Not saved",
      tone: "unsaved",
    });
  });

  it("never mentions the preview site in hosted ops", () => {
    assert.equal(eventHeaderFlag({ preview: "stale", live: "unpublished" }, false).label, "Not on the website yet");
    assert.equal(eventHeaderFlag({ preview: "stale", live: "stale" }, false).label, "Website has an older version");
  });

  it("separates never published, older version and live", () => {
    assert.equal(
      eventHeaderFlag({ preview: "current", live: "unpublished" }, false).label,
      "Not on the website yet",
    );
    assert.equal(
      eventHeaderFlag({ preview: "current", live: "stale" }, false).label,
      "Website has an older version",
    );
    assert.deepEqual(eventHeaderFlag({ preview: "current", live: "current" }, false), {
      label: "On the website",
      tone: "live",
    });
  });

  it("local ops talks about its local preview only", () => {
    assert.equal(
      eventHeaderFlag({ preview: "current", live: "current" }, false, { local: true }).label,
      "Local preview",
    );
    assert.equal(
      eventHeaderFlag({ preview: "stale", live: "current" }, false, { local: true }).label,
      "Not in local preview",
    );
  });
});
