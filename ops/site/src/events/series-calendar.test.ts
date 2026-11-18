import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { OpsEventOccurrence } from "../app/api.ts";
import {
	describeSeriesNight,
	seriesAgendaWeeks,
	seriesCalendarMonths,
	seriesMonthRange,
	seriesNights,
	type SeriesNightDefaults,
} from "./series-calendar.ts";

const chezPickle: SeriesNightDefaults = {
	name: "Chez Pickle",
	artist: "",
	startTime: "17:00",
	endTime: "22:00",
	time: "",
	repeatUnit: "week",
};

function occurrence(date: string, overrides: Partial<OpsEventOccurrence["overrides"]> = {}): OpsEventOccurrence {
	return {
		id: date,
		date,
		slug: "",
		sanityId: "",
		clickupTaskId: "",
		isSpecialEdition: false,
		overrides: {
			name: "",
			artist: "",
			offer: "",
			description: "",
			shortDescription: "",
			time: "",
			startTime: "",
			endTime: "",
			nightSchedule: null,
			operationsNotes: "",
			imageLinks: [],
			image: null,
			heroCrops: null,
			...overrides,
		},
	};
}

describe("describeSeriesNight", () => {
	it("a night that follows the series shows its time and no marks", () => {
		const night = describeSeriesNight(chezPickle, "2026-11-26");
		assert.equal(night.time, "5pm–10pm");
		assert.deepEqual(night.marks, []);
		assert.equal(night.title, "");
	});

	it("marks a night added by hand, but not on an open series", () => {
		assert.deepEqual(
			describeSeriesNight(chezPickle, "2026-11-19", { added: true }).marks.map((m) => m.kind),
			["added"],
		);
		assert.deepEqual(
			describeSeriesNight({ ...chezPickle, repeatUnit: "none" }, "2026-11-19", { added: true }).marks,
			[],
		);
	});

	it("marks its own time and shows it", () => {
		const night = describeSeriesNight(chezPickle, "2026-11-27", {
			occurrence: occurrence("2026-11-27", { startTime: "19:00", endTime: "01:00" }),
		});
		assert.equal(night.time, "7pm–1am");
		assert.deepEqual(night.marks.map((m) => m.kind), ["time"]);
	});

	it("a time override equal to the series is not a change", () => {
		const night = describeSeriesNight(chezPickle, "2026-11-27", {
			occurrence: occurrence("2026-11-27", { startTime: "17:00" }),
		});
		assert.deepEqual(night.marks, []);
	});

	it("marks own details and names which ones", () => {
		const night = describeSeriesNight(chezPickle, "2026-11-28", {
			occurrence: occurrence("2026-11-28", {
				name: "Pickle Party",
				artist: "DJ Dill",
				description: "Brine all night",
				imageLinks: ["https://example.com/a.jpg"],
			}),
		});
		assert.equal(night.title, "Pickle Party");
		assert.equal(night.guest, "DJ Dill");
		const mark = night.marks.find((m) => m.kind === "edited");
		assert.equal(mark?.title, "Own name, guest, description, photo");
	});

	it("a name equal to the series name is not its own title", () => {
		const night = describeSeriesNight(chezPickle, "2026-11-28", {
			occurrence: occurrence("2026-11-28", { name: "chez pickle" }),
		});
		assert.equal(night.title, "");
		assert.deepEqual(night.marks, []);
	});

	it("marks special events on an open series only", () => {
		const special = { ...occurrence("2026-11-21"), isSpecialEdition: true };
		assert.deepEqual(
			describeSeriesNight({ ...chezPickle, repeatUnit: "none" }, "2026-11-21", { occurrence: special }).marks.map(
				(m) => m.kind,
			),
			["special"],
		);
		assert.deepEqual(describeSeriesNight(chezPickle, "2026-11-21", { occurrence: special }).marks, []);
	});
});

describe("seriesNights", () => {
	it("adds skipped nights in date order and flags added ones", () => {
		const nights = seriesNights(chezPickle, {
			dates: ["2026-11-19", "2026-11-25", "2026-11-27"],
			extraDates: ["2026-11-19"],
			skippedDates: ["2026-11-26"],
		});
		assert.deepEqual(
			nights.map((n) => [n.date, n.skipped, n.marks.map((m) => m.kind).join(",")]),
			[
				["2026-11-19", false, "added"],
				["2026-11-25", false, ""],
				["2026-11-26", true, "skipped"],
				["2026-11-27", false, ""],
			],
		);
	});
});

describe("seriesCalendarMonths", () => {
	it("lays out Monday-first weeks with nights on their days only inside the month", () => {
		const nights = seriesNights(chezPickle, { dates: ["2026-11-30", "2026-12-02"] });
		const [november, december] = seriesCalendarMonths(nights, "2026-11", 2);
		assert.equal(november.label, "November 2026");
		assert.equal(november.weeks.length, 6);
		assert.equal(november.weeks[0][0].date, "2026-10-26");
		assert.equal(november.weeks[0][6].date, "2026-11-01");
		assert.ok(november.weeks.every((week) => week.length === 7));
		assert.equal(november.weeks[5][0].night?.date, "2026-11-30");
		// 2 Dec sits in November's last row but belongs to December.
		assert.equal(november.weeks[5][2].inMonth, false);
		assert.equal(november.weeks[5][2].night, null);
		assert.equal(december.label, "December 2026");
		assert.equal(december.weeks[0][2].night?.date, "2026-12-02");
	});
});

describe("seriesAgendaWeeks", () => {
	it("groups nights in the window by their Monday", () => {
		const nights = seriesNights(chezPickle, {
			dates: ["2026-10-31", "2026-11-19", "2026-11-22", "2026-11-25", "2027-01-01"],
		});
		const weeks = seriesAgendaWeeks(nights, "2026-11-01", "2027-01-01");
		assert.deepEqual(
			weeks.map((w) => [w.label, w.nights.map((n) => n.date)]),
			[
				["Week of 16 Nov", ["2026-11-19", "2026-11-22"]],
				["Week of 23 Nov", ["2026-11-25"]],
			],
		);
	});
});

describe("seriesMonthRange", () => {
	it("pages from the first night's month to the window that shows the last", () => {
		const nights = seriesNights(chezPickle, { dates: ["2026-09-03", "2027-02-10"] });
		assert.deepEqual(seriesMonthRange(nights, "2026-11", 2), { earliest: "2026-09", latest: "2027-01" });
	});

	it("never pages before this month when every night is ahead, nor needs paging for a short run", () => {
		const nights = seriesNights(chezPickle, { dates: ["2026-11-25", "2026-12-20"] });
		assert.deepEqual(seriesMonthRange(nights, "2026-11", 2), { earliest: "2026-11", latest: "2026-11" });
		assert.deepEqual(seriesMonthRange([], "2026-11", 2), { earliest: "2026-11", latest: "2026-11" });
	});
});
