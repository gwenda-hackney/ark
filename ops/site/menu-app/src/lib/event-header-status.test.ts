import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eventHeaderFlag } from "./event-header-status.ts";

describe("eventHeaderFlag", () => {
  it("flags a saved edit that is not on preview", () => {
    assert.deepEqual(
      eventHeaderFlag({ preview: "stale", live: "stale" }, false),
      { label: "Unpublished changes", tone: "unpublished" },
    );
    assert.deepEqual(
      eventHeaderFlag({ preview: "unpublished", live: "unpublished" }, false),
      { label: "Unpublished changes", tone: "unpublished" },
    );
  });

  it("puts unsaved edits ahead of publish state", () => {
    assert.deepEqual(
      eventHeaderFlag({ preview: "current", live: "current" }, true),
      { label: "Unsaved changes", tone: "unsaved" },
    );
  });

  it("shows preview and live once the diary matches", () => {
    assert.deepEqual(
      eventHeaderFlag({ preview: "current", live: "unpublished" }, false),
      { label: "On preview", tone: "preview" },
    );
    assert.deepEqual(
      eventHeaderFlag({ preview: "current", live: "current" }, false),
      { label: "Live", tone: "live" },
    );
  });
});
