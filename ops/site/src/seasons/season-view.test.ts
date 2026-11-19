import { describe, expect, it } from "vitest";
import { blankSeason, showDays } from "./season-view";

describe("season view", () => {
	it("says the days home shows it, with the year only when it isn't this one", () => {
		const now = new Date("2026-11-19T12:00:00Z");
		expect(showDays({ showFrom: "2026-11-01", showUntil: "2026-12-20" }, now)).toBe("1 Nov to 20 Dec");
		expect(showDays({ showFrom: "2026-12-01", showUntil: "2027-01-06" }, now)).toBe("1 Dec to 6 Jan 2027");
	});

	it("starts a new one on home from today for a month", () => {
		expect(blankSeason(new Date("2026-11-19T12:00:00Z"))).toMatchObject({ showFrom: "2026-11-19", showUntil: "2026-12-19" });
	});
});
