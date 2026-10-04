import { describe, expect, it } from "vitest";
import { dateRangeError, formatDateGB, parseDate, weekdayShort } from "./date-input";

const today = new Date(2026, 9, 3); // Sat 3 Oct 2026

describe("parseDate", () => {
	it.each([
		["24/10/2026", "2026-10-24"],
		["24/10/26", "2026-10-24"],
		["24-10-2026", "2026-10-24"],
		["24.10.2026", "2026-10-24"],
		["4/1/2027", "2027-01-04"],
		["24102026", "2026-10-24"],
		["241026", "2026-10-24"],
		["24 Oct 2026", "2026-10-24"],
		["Sat 24 Oct 2026", "2026-10-24"],
		["24th October", "2026-10-24"],
		["2026-10-24", "2026-10-24"],
		["today", "2026-10-03"],
		["tomorrow", "2026-10-04"],
	])("reads %s", (raw, expected) => {
		expect(parseDate(raw, today)).toBe(expected);
	});

	it("reads day first, never month first", () => {
		expect(parseDate("03/04/2027", today)).toBe("2027-04-03");
		expect(parseDate("12/31/2026", today)).toBeNull();
	});

	it("guesses the year: this year, next year once it's well past", () => {
		expect(parseDate("24/10", today)).toBe("2026-10-24");
		expect(parseDate("1/9", today)).toBe("2026-09-01");
		expect(parseDate("4/1", today)).toBe("2027-01-04");
	});

	it("refuses dates that don't exist and words it can't read", () => {
		expect(parseDate("31/02/2026", today)).toBeNull();
		expect(parseDate("soon", today)).toBeNull();
		expect(parseDate("24 Foo 2026", today)).toBeNull();
	});

	it("is blank for a blank field", () => {
		expect(parseDate("", today)).toBe("");
		expect(parseDate("   ", today)).toBe("");
	});
});

describe("showing dates", () => {
	it("formats day first with the weekday alongside", () => {
		expect(formatDateGB("2026-10-24")).toBe("24/10/2026");
		expect(formatDateGB("")).toBe("");
		expect(weekdayShort("2026-10-24")).toBe("Sat");
		expect(weekdayShort("nope")).toBe("");
	});

	it("says when a date is out of range", () => {
		expect(dateRangeError("2026-10-01", "2026-10-03")).toBe("Pick 03/10/2026 or later.");
		expect(dateRangeError("2026-12-01", "", "2026-11-30")).toBe("Pick 30/11/2026 or earlier.");
		expect(dateRangeError("2026-10-05", "2026-10-03", "2026-10-30")).toBe("");
		expect(dateRangeError("", "2026-10-03")).toBe("");
	});
});
