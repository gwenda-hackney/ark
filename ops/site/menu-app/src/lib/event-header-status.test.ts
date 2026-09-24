import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eventHeaderFlag } from "./event-header-status.ts";

describe("eventHeaderFlag", () => {
  it("puts unsaved edits ahead of everything", () => {
    assert.deepEqual(eventHeaderFlag({ preview: "current", live: "current" }, true), {
      label: "Unsaved changes",
      tone: "unsaved",
    });
    assert.deepEqual(eventHeaderFlag(null, true).tone, "unsaved");
  });

  it("flags a saved event that staging does not have", () => {
    assert.deepEqual(eventHeaderFlag({ preview: "stale", live: "stale" }, false), {
      label: "Not staged",
      tone: "unpublished",
    });
  });

  it("separates staged from live", () => {
    assert.deepEqual(eventHeaderFlag({ preview: "current", live: "stale" }, false), {
      label: "Staged · not live",
      tone: "preview",
    });
    assert.deepEqual(eventHeaderFlag({ preview: "current", live: "current" }, false), {
      label: "Live",
      tone: "live",
    });
  });

  it("never claims live from local ops", () => {
    assert.deepEqual(
      eventHeaderFlag({ preview: "current", live: "current" }, false, { local: true }),
      { label: "Local preview", tone: "preview" },
    );
  });
});
