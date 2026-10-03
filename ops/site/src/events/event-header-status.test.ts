import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { eventHeaderFlag } from "./event-header-status.ts";

describe("eventHeaderFlag", () => {
  it("puts unsaved edits ahead of everything", () => {
    const flag = eventHeaderFlag({ preview: "current", live: "current" }, true);
    assert.equal(flag.label, "Not saved");
    assert.equal(flag.tone, "danger");
  });

  it("marks a new, unsaved event with its own badge", () => {
    assert.equal(eventHeaderFlag(null, false).label, "New");
  });

  it("says when the background work is still going or has failed", () => {
    const publish = { preview: "stale", live: "current" };
    const waiting = eventHeaderFlag(publish, false, { job: "waiting" });
    assert.equal(waiting.label, "Updating");
    assert.equal(waiting.title, "Saved. Getting it ready for the website…");
    const failed = eventHeaderFlag(publish, false, { job: "failed" });
    assert.equal(failed.label, "Failed");
    assert.equal(failed.tone, "danger");
    assert.equal(eventHeaderFlag(publish, true, { job: "waiting" }).label, "Not saved");
  });

  it("never mentions the preview site in hosted ops", () => {
    assert.equal(eventHeaderFlag({ preview: "stale", live: "unpublished" }, false).label, "Not live");
    assert.equal(eventHeaderFlag({ preview: "stale", live: "stale" }, false).label, "Changed");
  });

  it("separates never published, changed and live, with the long words as the tooltip", () => {
    const never = eventHeaderFlag({ preview: "current", live: "unpublished" }, false);
    assert.equal(never.label, "Not live");
    assert.equal(never.title, "Not on the website yet");
    const changed = eventHeaderFlag({ preview: "current", live: "stale" }, false);
    assert.equal(changed.label, "Changed");
    assert.match(changed.title, /^Changes not on the website yet/);
    assert.deepEqual(eventHeaderFlag({ preview: "current", live: "current" }, false), {
      label: "Live",
      title: "On the website",
      tone: "success",
      live: true,
    });
  });

  it("keeps every label short enough to glance at", () => {
    const publishes = [
      null,
      { preview: "x", live: "current" },
      { preview: "x", live: "unpublished" },
      { preview: "x", live: "stale" },
    ];
    for (const publish of publishes) {
      for (const job of [null, "waiting", "failed"] as const) {
        for (const dirty of [true, false]) {
          assert.ok(eventHeaderFlag(publish, dirty, { job }).label.length <= 14);
        }
      }
    }
  });
});
