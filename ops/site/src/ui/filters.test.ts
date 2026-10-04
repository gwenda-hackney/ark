import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { activeFilterCount, dateRangeLabel, formatFilterDate } from "./filters";

describe("filter helpers", () => {
	it("counts filters that are set", () => {
		assert.equal(activeFilterCount([]), 0);
		assert.equal(activeFilterCount(["", [], false, null, undefined, "  "]), 0);
		assert.equal(activeFilterCount(["x", ["a", "b"], true]), 3);
		assert.equal(activeFilterCount(["2026-10-01", []]), 1);
	});

	it("shows dates the British way, with the year only when it differs", () => {
		const now = new Date(2026, 9, 3);
		assert.equal(formatFilterDate("2026-10-01", now), "1 Oct");
		assert.equal(formatFilterDate("2027-01-05", now), "5 Jan 2027");
		assert.equal(formatFilterDate("not a date", now), "not a date");
	});

	it("labels a date range for a chip", () => {
		const now = new Date(2026, 9, 3);
		assert.equal(dateRangeLabel("2026-10-01", "2026-10-31", now), "1 Oct – 31 Oct");
		assert.equal(dateRangeLabel("2026-10-01", "", now), "From 1 Oct");
		assert.equal(dateRangeLabel("", "2026-10-31", now), "Until 31 Oct");
		assert.equal(dateRangeLabel("", "", now), "");
	});
});
