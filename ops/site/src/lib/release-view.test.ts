import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  countLabel,
  fieldSummary,
  filterEntries,
  groupEntries,
  includedWith,
  type ReleaseViewEntry,
} from "./release-view.ts";

const entry = (
  id: string,
  type: string,
  change: ReleaseViewEntry["change"],
  refs: string[] = [],
  fields: string[] = [],
): ReleaseViewEntry => ({
  id,
  type,
  typeLabel: type === "event" ? "Nights" : "Series",
  label: id,
  change,
  refs,
  fields: fields.map((label) => ({ key: label.toLowerCase(), label })),
});

const entries = [
  entry("series-gwenda-sat", "eventSeries", "changed", [], ["Title"]),
  entry("event-gwenda-sat-2026-10-03", "event", "added", ["series-gwenda-sat"]),
  entry("event-old-2026-09-01", "event", "removed"),
];

describe("release view", () => {
  it("groups by type in server order", () => {
    assert.deepEqual(
      groupEntries(entries).map((group) => [group.label, group.entries.length]),
      [
        ["Series", 1],
        ["Nights", 2],
      ],
    );
  });

  it("finds a series and its nights by slug", () => {
    assert.equal(filterEntries(entries, "gwenda-sat").length, 2);
    assert.equal(filterEntries(entries, "  ").length, 3);
  });

  it("a night brings its changed series along; removals bring nothing", () => {
    assert.deepEqual(
      includedWith(entries, new Set(["event-gwenda-sat-2026-10-03"])).map((row) => row.id),
      ["series-gwenda-sat"],
    );
    assert.deepEqual(includedWith(entries, new Set(["event-old-2026-09-01"])), []);
    assert.deepEqual(
      includedWith(entries, new Set(["event-gwenda-sat-2026-10-03", "series-gwenda-sat"])),
      [],
    );
  });

  it("summarises changed fields", () => {
    const many = entry("x", "event", "changed", [], ["Title", "Date", "Time", "Offer"]);
    assert.equal(fieldSummary(many), "Title, Date, Time +1");
    assert.equal(fieldSummary(entries[1]), "Not on the live site yet");
    assert.equal(countLabel(1), "1 change");
  });
});
