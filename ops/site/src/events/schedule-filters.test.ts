import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { scheduleRangeDates } from "./schedule-filters";

describe("schedule quick date ranges", () => {
	// Saturday 3 October 2026.
	const today = "2026-10-03";

	it("This week runs from today to Sunday", () => {
		assert.deepEqual(scheduleRangeDates("week", today), { from: today, to: "2026-10-04" });
		// A Monday runs to the Sunday after.
		assert.deepEqual(scheduleRangeDates("week", "2026-10-05"), { from: "2026-10-05", to: "2026-10-11" });
	});

	it("Next 30 days crosses the month end", () => {
		assert.deepEqual(scheduleRangeDates("next30", today), { from: today, to: "2026-11-02" });
	});

	it("Any time clears the dates and Custom leaves them alone", () => {
		assert.deepEqual(scheduleRangeDates("any", today), { from: "", to: "" });
		assert.equal(scheduleRangeDates("custom", today), null);
	});
});
