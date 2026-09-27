import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { nearestIndex, parseTime, timeOptions } from "./time-input.ts";

describe("parseTime", () => {
	it("reads the ways people type a time", () => {
		const cases: [string, string | null][] = [
			["", ""],
			["  ", ""],
			["19:00", "19:00"],
			["7:30", "07:30"],
			["19.30", "19:30"],
			["1930", "19:30"],
			["730", "07:30"],
			["7", "07:00"],
			["7pm", "19:00"],
			["7 PM", "19:00"],
			["7:15pm", "19:15"],
			["11p", "23:00"],
			["12am", "00:00"],
			["12pm", "12:00"],
			["noon", "12:00"],
			["midnight", "00:00"],
			["24:00", "00:00"],
			["25", null],
			["13pm", null],
			["19:75", null],
			["tea time", null],
		];
		for (const [raw, want] of cases) assert.equal(parseTime(raw), want, raw);
	});
});

describe("timeOptions", () => {
	it("starts at the day start and wraps into the small hours", () => {
		const opts = timeOptions(15, 6);
		assert.equal(opts.length, 96);
		assert.equal(opts[0], "06:00");
		assert.equal(opts.at(-1), "05:45");
		assert.ok(opts.indexOf("00:00") > opts.indexOf("23:45"));
	});
});

describe("nearestIndex", () => {
	it("finds the closest step, across midnight too", () => {
		const opts = timeOptions(15, 6);
		assert.equal(opts[nearestIndex(opts, "19:07")], "19:00");
		assert.equal(opts[nearestIndex(opts, "19:08")], "19:15");
		assert.equal(opts[nearestIndex(opts, "23:58")], "00:00");
		assert.equal(nearestIndex(opts, ""), -1);
	});
});
