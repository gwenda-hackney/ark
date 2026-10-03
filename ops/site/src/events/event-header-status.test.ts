import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { eventHeaderFlag } from "./event-header-status.ts";

describe("eventHeaderFlag", () => {
  it("puts unsaved edits ahead of everything", () => {
    assert.deepEqual(eventHeaderFlag({ preview: "current", live: "current" }, true), {
      label: "Not saved",
      tone: "unsaved",
    });
  });

  it("marks a new, unsaved event with its own badge", () => {
    assert.deepEqual(eventHeaderFlag(null, false), { label: "New", tone: "new" });
  });

  it("says when the background work is still going or has failed", () => {
    const publish = { preview: "stale", live: "current" };
    assert.equal(eventHeaderFlag(publish, false, { job: "waiting" }).label, "Saved. Getting it ready…");
    assert.equal(eventHeaderFlag(publish, false, { job: "failed" }).tone, "unpublished");
    assert.equal(eventHeaderFlag(publish, true, { job: "waiting" }).label, "Not saved");
  });

  it("never mentions the preview site in hosted ops", () => {
    assert.equal(eventHeaderFlag({ preview: "stale", live: "unpublished" }, false).label, "Not on the website yet");
    assert.equal(eventHeaderFlag({ preview: "stale", live: "stale" }, false).label, "Changes not on the website yet");
  });

  it("separates never published, changed and live", () => {
    assert.equal(
      eventHeaderFlag({ preview: "current", live: "unpublished" }, false).label,
      "Not on the website yet",
    );
    assert.equal(
      eventHeaderFlag({ preview: "current", live: "stale" }, false).label,
      "Changes not on the website yet",
    );
    assert.deepEqual(eventHeaderFlag({ preview: "current", live: "current" }, false), {
      label: "On the website",
      tone: "live",
    });
  });
});
