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

  it("flags a saved event the preview site does not have", () => {
    assert.equal(eventHeaderFlag({ preview: "stale", live: "stale" }, false).label, "Not on the preview site");
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

  it("never claims the website from local ops", () => {
    assert.equal(
      eventHeaderFlag({ preview: "current", live: "current" }, false, { local: true }).label,
      "Local preview",
    );
  });
});
