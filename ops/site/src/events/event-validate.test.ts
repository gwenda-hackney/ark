import { describe, expect, it } from "vitest";
import { firstErrorKey } from "../ui/form-errors.svelte";
import { EVENT_FIELD_ORDER, eventFieldTab, validateEvent } from "./event-validate";

const base = {
	name: "Jazz Night",
	description: "<p>Live jazz.</p>",
	startsOn: "2026-10-01",
	endsOn: "2026-12-31",
	repeatUnit: "week",
	repeatEvery: "1",
	monthDay: "",
};
const series = { creatingNight: false, editingOccurrence: false, attachSeriesId: "" };

describe("validateEvent", () => {
	it("passes a complete series", () => {
		expect(validateEvent(base, series)).toEqual({});
	});

	it("names each missing field by its id", () => {
		expect(validateEvent({ ...base, name: " ", description: "<p> </p>" }, series)).toEqual({
			"event-name": "Add a name.",
			"event-description": "Add a description. The website needs one.",
		});
	});

	it("won't save a description link the website wouldn't show (#33)", () => {
		expect(validateEvent({ ...base, description: "[Tickets](javascript:alert)" }, series)["event-description"]).toMatch(
			/won't work on the website/,
		);
		expect(validateEvent({ ...base, description: "[Tickets](https://dice.fm/x)" }, series)).toEqual({});
	});

	it("wants a first night on a repeating series; the last night is optional, not before the first (#245)", () => {
		expect(validateEvent({ ...base, endsOn: "" }, series)).toEqual({});
		expect(validateEvent({ ...base, startsOn: "", endsOn: "" }, series)["event-starts"]).toBe("Add the first night.");
		expect(validateEvent({ ...base, endsOn: "2026-09-01" }, series)["event-ends"]).toBe(
			"Pick 01/10/2026 or later.",
		);
		expect(validateEvent({ ...base, repeatUnit: "none", endsOn: "" }, series)).toEqual({});
	});

	it("checks the repeat figures", () => {
		expect(validateEvent({ ...base, repeatEvery: "0" }, series)["event-every"]).toBe(
			"Use a number from 1 to 52.",
		);
		expect(validateEvent({ ...base, repeatEvery: "" }, series)["event-every"]).toBe(
			"Add how often it repeats.",
		);
		expect(validateEvent({ ...base, repeatUnit: "month", monthDay: "32" }, series)["event-month-day"]).toBe(
			"Use a number from 1 to 31.",
		);
	});

	it("wants a date on a special event", () => {
		expect(validateEvent({ ...base, repeatUnit: "once", startsOn: "" }, series)).toEqual({
			"event-date": "Add a date.",
		});
	});

	it("wants a series and a date for a new night, and nothing else", () => {
		expect(
			validateEvent(
				{ ...base, name: "", description: "", startsOn: "" },
				{ creatingNight: true, editingOccurrence: false, attachSeriesId: "" },
			),
		).toEqual({ "event-series": "Choose a series.", "event-date": "Add a date." });
	});
});

describe("where the problems are", () => {
	it("puts a saved series' pattern on Schedule, its times and the rest on Details", () => {
		expect(eventFieldTab("event-ends", true)).toBe("schedule");
		expect(eventFieldTab("event-unit", true)).toBe("schedule");
		expect(eventFieldTab("event-start-time", true)).toBe("details");
		expect(eventFieldTab("event-description", true)).toBe("details");
		expect(eventFieldTab("event-name", true)).toBe("details");
	});

	it("keeps every field of a night, a special event or a new form on Details (#158)", () => {
		expect(eventFieldTab("event-ends")).toBe("details");
		expect(eventFieldTab("event-date")).toBe("details");
		expect(eventFieldTab("event-name")).toBe("details");
	});

	it("puts the series a new night joins first, above its name (#158)", () => {
		const errors = { "event-name": "Add a name.", "event-series": "Choose a series." };
		expect(firstErrorKey(errors, EVENT_FIELD_ORDER)).toBe("event-series");
	});

	it("starts with the field highest on screen", () => {
		const errors = validateEvent({ ...base, name: "", endsOn: "" }, series);
		expect(firstErrorKey(errors, EVENT_FIELD_ORDER)).toBe("event-name");
	});
});
