import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { blankWeek, savedMessage, websiteBadge, withDay } from "./venue-page";
import type { OpeningDay } from "./types";

describe("venue details page", () => {
	it("says where the hours stand on the website", () => {
		assert.deepEqual(
			(["live", "preview", "behind", "none", "unknown"] as const).map((state) => websiteBadge(state).label),
			[
				"On the website",
				"Waiting for Update website",
				"Website shows other hours",
				"Not on the website yet",
				"Website not checked",
			],
		);
		assert.equal(websiteBadge("live").tone, "success");
	});

	it("says what a save did", () => {
		assert.match(savedMessage({ published: true, website: "live" }), /^Saved\. Website pages show/);
		assert.match(savedMessage({ published: false, website: "preview" }), /Update website on the Website page/);
		assert.equal(savedMessage({ published: false, website: "unknown" }), "Saved in ops.");
	});

	it("changes one day and keeps the week Monday first", () => {
		const week = blankWeek();
		assert.deepEqual(
			week.map((day) => day.day),
			["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
		);
		const next = withDay(week, { day: "sat", closed: false, opens: "16:00", closes: "01:00" });
		assert.deepEqual(next[5], { day: "sat", closed: false, opens: "16:00", closes: "01:00" });
		assert.equal(next.length, 7);
		// A day marked closed drops its times
		const shut = withDay(next, { day: "sat", closed: true, opens: "16:00", closes: "01:00" } as OpeningDay);
		assert.deepEqual(shut[5], { day: "sat", closed: true, opens: "", closes: "" });
	});
});
