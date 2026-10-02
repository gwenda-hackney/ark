import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { keepsDroppedNight } from "./event-store.js";

describe("dropping a night from the schedule", () => {
  const today = "2026-09-26";
  const published = { id: "a", date: "2026-09-29", sanityId: "event-jazz-2026-09-29", snapshots: { preview: { hash: "x" } } };

  it("deletes a night that never reached the website, or is past", () => {
    assert.equal(keepsDroppedNight({ id: "b", date: "2026-09-29" }, today), false);
    assert.equal(keepsDroppedNight({ ...published, date: "2026-09-22" }, today), false);
  });
});
