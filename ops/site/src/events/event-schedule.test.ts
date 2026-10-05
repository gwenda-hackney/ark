import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { OpsEvent, OpsEventOccurrence } from "../app/api.ts";
import {
	compareSeriesByWeekday,
	countEventScheduleRows,
	eventWeekStart,
	filterEventSchedule,
	buildScheduleCalendar,
	formatScheduleDate,
	formatScheduleWeekday,
	groupEventSchedule,
	paginateEventSchedule,
	scheduleMonthLabel,
	seriesWeekdayLabel,
	seriesNextNightLabel,
	shiftScheduleMonth,
} from "./event-schedule.ts";

function event(
	id: string,
	name: string,
	dates: string[],
): OpsEvent {
	return {
		id,
		name,
		artist: "",
		offer: "",
		pageUrl: "",
		description: "",
		shortDescription: "",
		nightSchedule: [],
		operationsNotes: "",
		imageLinks: [],
		startsOn: dates[0] || "",
		time: "",
		startTime: "",
		endTime: "",
		repeatEvery: 1,
		repeatUnit: "week",
		weekdays: [],
		monthDay: 0,
		endsOn: "",
		skippedDates: [],
		extraDates: [],
		slug: id,
		replacesSeries: "",
		driveFolderId: "",
		driveFolderUrl: "",
		mainImage: null,
		heroCrops: null,
		gallery: [],
		dates: [],
		publish: {
			preview: "current",
			live: "unpublished",
			nextDate: dates[0] || "",
			previewDates: dates,
		},
	};
}

/** A night row with empty overrides; `overrides` fills in the ones a test needs. */
function night(
	id: string,
	date: string,
	slug: string,
	overrides: Partial<OpsEventOccurrence["overrides"]> = {},
	isSpecialEdition = false,
): OpsEventOccurrence {
	return {
		id,
		date,
		slug,
		sanityId: "",
		clickupTaskId: "",
		isSpecialEdition,
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

describe("groupEventSchedule", () => {
	it("groups occurrences Monday to Sunday in date order", () => {
		const weeks = groupEventSchedule(
			[
				event("fri", "Music Friday", ["2026-09-25", "2026-10-02"]),
				event("wed", "Wednesday Jazz", ["2026-09-23", "2026-09-30"]),
				event("thu", "Gwenda Selects", ["2026-09-24", "2026-10-01"]),
			],
			new Date(2026, 8, 22),
		);

		assert.equal(weeks[0].label, "This week · 21 Sept–27 Sept");
		assert.deepEqual(
			weeks[0].rows.map((row) => row.date),
			["2026-09-23", "2026-09-24", "2026-09-25"],
		);
		assert.equal(weeks[1].label, "Next week · 28 Sept–4 Oct");
		assert.deepEqual(
			weeks[1].rows.map((row) => row.date),
			["2026-09-30", "2026-10-01", "2026-10-02"],
		);
	});

	it("labels later weeks with the date range only", () => {
		const weeks = groupEventSchedule(
			[event("fri", "Music Friday", ["2026-10-09", "2026-10-16"])],
			new Date(2026, 8, 22),
		);
		assert.equal(weeks[0].label, "5 Oct–11 Oct");
		assert.equal(weeks[1].label, "12 Oct–18 Oct");
	});

	it("keeps one row when an event has duplicate dates", () => {
		const weeks = groupEventSchedule(
			[
				{
					...event("fri", "Music Friday", ["2026-09-25"]),
					dates: [
						night("1", "2026-09-25", "a"),
						night("2", "2026-09-25", "b"),
					],
					repeatUnit: "none",
					startsOn: "2026-09-25",
				},
			],
			new Date(2026, 8, 22),
		);
		assert.equal(weeks[0].rows.length, 1);
		assert.equal(weeks[0].rows[0].occurrence?.id, "2");
	});
});

describe("filterEventSchedule", () => {
	it("filters by series and date range", () => {
		const weeks = groupEventSchedule(
			[
				event("fri", "Music Friday", ["2026-09-25", "2026-10-02"]),
				event("wed", "Wednesday Jazz", ["2026-09-23", "2026-09-30"]),
			],
			new Date(2026, 8, 22),
		);
		const filtered = filterEventSchedule(weeks, {
			eventIds: ["wed"],
			from: "2026-09-24",
			to: "2026-09-30",
		});
		assert.deepEqual(
			filtered.flatMap((week) => week.rows.map((row) => row.date)),
			["2026-09-30"],
		);
	});

	it("filters by full-text query across series and night fields", () => {
		const weeks = groupEventSchedule(
			[
				{
					...event("fri", "Music Friday", ["2026-09-25"]),
					artist: "Guest DJ",
				},
				{
					...event("hal", "Halloween", ["2026-10-31"]),
					artist: "Saif",
					description: "Live band.",
				},
			],
			new Date(2026, 8, 22),
		);
		const byArtist = filterEventSchedule(weeks, { query: "saif live" });
		assert.deepEqual(
			byArtist.flatMap((week) => week.rows.map((row) => row.event.id)),
			["hal"],
		);
		const bySeries = filterEventSchedule(weeks, { query: "music" });
		assert.deepEqual(
			bySeries.flatMap((week) => week.rows.map((row) => row.event.id)),
			["fri"],
		);
	});
});

describe("paginateEventSchedule", () => {
	it("keeps the first n rows across weeks", () => {
		const weeks = groupEventSchedule(
			[
				event("fri", "Music Friday", ["2026-09-25", "2026-10-02"]),
				event("wed", "Wednesday Jazz", ["2026-09-23", "2026-09-30"]),
				event("thu", "Gwenda Selects", ["2026-09-24", "2026-10-01"]),
			],
			new Date(2026, 8, 22),
		);
		const page = paginateEventSchedule(weeks, 2);
		assert.deepEqual(
			page.flatMap((week) => week.rows.map((row) => `${row.event.id}:${row.date}`)),
			["wed:2026-09-23", "thu:2026-09-24"],
		);
		assert.equal(countEventScheduleRows(weeks), 6);
	});
});

describe("compareSeriesByWeekday", () => {
	it("orders series Monday to Sunday, with Gwenda Nights on Saturday", () => {
		const rows: OpsEvent[] = [
			event("fri", "Music Friday", ["2026-09-25"]),
			{
				...event("gn", "Gwenda Nights", ["2026-09-26"]),
				repeatUnit: "none",
				weekdays: [],
			},
			{
				...event("wed", "Wednesday Jazz", ["2026-09-23"]),
				weekdays: ["wed"],
			},
			{
				...event("thu", "Gwenda Selects", ["2026-09-24"]),
				weekdays: ["thu"],
			},
			{
				...event("sun", "Sunday Social", ["2026-09-27"]),
				weekdays: ["sun"],
			},
		];
		assert.deepEqual(
			[...rows].sort(compareSeriesByWeekday).map((row) => row.name),
			[
				"Wednesday Jazz",
				"Gwenda Selects",
				"Music Friday",
				"Gwenda Nights",
				"Sunday Social",
			],
		);
		assert.equal(seriesWeekdayLabel(rows[1]), "Saturday");
	});
});

describe("buildScheduleCalendar", () => {
	it("lays September 2026 out Monday to Sunday and places nights on their dates", () => {
		const weeks = groupEventSchedule(
			[
				event("wed", "Wednesday Jazz", ["2026-09-23", "2026-09-30"]),
				event("fri", "Music Friday", ["2026-09-25", "2026-10-02"]),
				event("nov", "November Session", ["2026-11-06"]),
			],
			new Date(2026, 8, 22),
		);
		const calendar = buildScheduleCalendar(weeks, "2026-09");
		assert.equal(calendar.label, "September 2026");
		assert.equal(calendar.days.length, 35);
		assert.deepEqual(
			[calendar.days[0].date, calendar.days[0].inMonth],
			["2026-08-31", false],
		);
		assert.deepEqual(
			[calendar.days[1].date, calendar.days[1].inMonth],
			["2026-09-01", true],
		);
		assert.equal(calendar.days[30].date, "2026-09-30");
		assert.equal(calendar.days[34].date, "2026-10-04");
		const jazz = calendar.days.find((day) => day.date === "2026-09-23");
		assert.deepEqual(
			jazz?.rows.map((row) => row.event.name),
			["Wednesday Jazz"],
		);
		const spill = calendar.days.find((day) => day.date === "2026-10-02");
		assert.equal(spill?.inMonth, false);
		assert.equal(spill?.rows[0]?.event.id, "fri");
		assert.equal(
			calendar.days.some((day) => day.rows.some((row) => row.event.id === "nov")),
			false,
		);
	});

	it("steps across year boundaries", () => {
		assert.equal(shiftScheduleMonth("2026-12", 1), "2027-01");
		assert.equal(shiftScheduleMonth("2026-01", -1), "2025-12");
		assert.equal(scheduleMonthLabel("2026-09"), "September 2026");
	});
});

describe("seriesNextNightLabel", () => {
	it("names the next night when it is not the series title", () => {
		const row = {
			...event("nights", "Gwenda Nights", ["2026-10-10", "2026-10-31"]),
			dates: [
				night("1", "2026-10-10", "vbrave", { name: "Vbrave Vinyl Session" }),
			],
		};
		assert.equal(seriesNextNightLabel(row), "Vbrave Vinyl Session");
	});

	it("ignores a later guest when naming the next night", () => {
		const row = {
			...event("nights", "Gwenda Nights", ["2026-10-10", "2026-10-31"]),
			dates: [
				night("1", "2026-10-10", "vbrave"),
				night("2", "2026-10-31", "halloween", { name: "Halloween", artist: "Saif" }, true),
			],
		};
		assert.equal(seriesNextNightLabel(row), "");
	});
});
