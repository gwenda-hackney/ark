import { describe, expect, it } from "vitest";
import { formatMoney, formatNumber, numberError, parseNumber } from "./number-input";

describe("parseNumber", () => {
	it.each([
		["12.5", 12.5],
		["£12.50", 12.5],
		["40 %", 40],
		["120 ml", 120],
		["1,5", 1.5],
		["1,250", 1250],
		["1,250.75", 1250.75],
		[".5", 0.5],
		["-3", -3],
	])("reads %s as %s", (raw, expected) => {
		expect(parseNumber(raw)).toBe(expected);
	});

	it("is blank for a blank field and null for words", () => {
		expect(parseNumber("")).toBe("");
		expect(parseNumber("  ")).toBe("");
		expect(parseNumber("twelve")).toBeNull();
		expect(parseNumber("1.2.3")).toBeNull();
		expect(parseNumber("£")).toBeNull();
	});
});

describe("formatting", () => {
	it("drops trailing zeros unless fixed", () => {
		expect(formatNumber(12.5)).toBe("12.5");
		expect(formatNumber(12.456)).toBe("12.46");
		expect(formatNumber(12, { decimals: 2, fixed: true })).toBe("12.00");
	});

	it("shows money with two places and leaves unreadable text alone", () => {
		expect(formatMoney("12")).toBe("12.00");
		expect(formatMoney("£7.5")).toBe("7.50");
		expect(formatMoney("")).toBe("");
		expect(formatMoney("ask")).toBe("ask");
	});
});

describe("numberError", () => {
	it("says what to type, in words", () => {
		expect(numberError("abc", { noun: "a percentage" })).toBe("Enter a percentage, like 12.5.");
		expect(numberError("abc", { noun: "an amount in pounds", example: "12.50" })).toBe(
			"Enter an amount in pounds, like 12.50.",
		);
		expect(numberError("2.5", { integer: true })).toBe("Use a whole number.");
		expect(numberError("120", { min: 0, max: 100 })).toBe("Use a number from 0 to 100.");
		expect(numberError("-1", { min: 0 })).toBe("Use 0 or more.");
	});

	it("is happy with blank and in-range values", () => {
		expect(numberError("")).toBe("");
		expect(numberError("50", { min: 0, max: 100 })).toBe("");
	});
});
