import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OpsEvent } from "./api.ts";
import {
	compareSeriesByWeekday,
	countEventScheduleRows,
	eventWeekStart,
	filterEventSchedule,
	formatScheduleDate,
	formatScheduleWeekday,
	groupEventSchedule,
	paginateEventSchedule,
	seriesWeekdayLabel,
	seriesNextNightLabel,
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
		description: "",
		startsOn: dates[0] || "",
		repeatEvery: 1,
		repeatUnit: "week",
		weekdays: [],
		monthDay: 0,
		endsOn: "",
		slug: id,
		mainImage: null,
		images: [],
		dates: [],
		publish: {
			preview: "current",
			live: "unpublished",
			nextDate: dates[0] || "",
			previewDates: dates,
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
						{
							id: "1",
							date: "2026-09-25",
							slug: "a",
							sanityId: "",
							clickupTaskId: "",
							isSpecialEdition: false,
							overrides: {
								name: "",
								artist: "",
								offer: "",
								description: "",
								time: "",
								startTime: "",
								endTime: "",
								operationsNotes: "",
								imageLinks: [],
								image: null,
							},
						},
						{
							id: "2",
							date: "2026-09-25",
							slug: "b",
							sanityId: "",
							clickupTaskId: "",
							isSpecialEdition: false,
							overrides: {
								name: "",
								artist: "",
								offer: "",
								description: "",
								time: "",
								startTime: "",
								endTime: "",
								operationsNotes: "",
								imageLinks: [],
								image: null,
							},
						},
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
		const rows = [
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

describe("seriesNextNightLabel", () => {
	it("names the next night when it is not the series title", () => {
		const row = {
			...event("nights", "Gwenda Nights", ["2026-10-10", "2026-10-31"]),
			dates: [
				{
					id: "1",
					date: "2026-10-10",
					slug: "vbrave",
					sanityId: "",
					clickupTaskId: "",
					isSpecialEdition: false,
					overrides: {
						name: "Vbrave Vinyl Session",
						artist: "",
						offer: "",
						description: "",
						time: "",
						startTime: "",
						endTime: "",
						operationsNotes: "",
						imageLinks: [],
						image: null,
						heroCrops: null,
					},
				},
			],
		};
		assert.equal(seriesNextNightLabel(row), "Vbrave Vinyl Session");
	});

	it("ignores a later guest when naming the next night", () => {
		const row = {
			...event("nights", "Gwenda Nights", ["2026-10-10", "2026-10-31"]),
			dates: [
				{
					id: "1",
					date: "2026-10-10",
					slug: "vbrave",
					sanityId: "",
					clickupTaskId: "",
					isSpecialEdition: false,
					overrides: {
						name: "",
						artist: "",
						offer: "",
						description: "",
						time: "",
						startTime: "",
						endTime: "",
						operationsNotes: "",
						imageLinks: [],
						image: null,
						heroCrops: null,
					},
				},
				{
					id: "2",
					date: "2026-10-31",
					slug: "halloween",
					sanityId: "",
					clickupTaskId: "",
					isSpecialEdition: true,
					overrides: {
						name: "Halloween",
						artist: "Saif",
						offer: "",
						description: "",
						time: "",
						startTime: "",
						endTime: "",
						operationsNotes: "",
						imageLinks: [],
						image: null,
						heroCrops: null,
					},
				},
			],
		};
		assert.equal(seriesNextNightLabel(row), "");
	});
});
