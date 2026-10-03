import { describe, expect, it } from "vitest";
import { pourTargetToSave } from "./pour-target-commit";

describe("pourTargetToSave", () => {
	it("saves a real change once", () => {
		expect(pourTargetToSave("22", 20)).toBe(22);
		expect(pourTargetToSave("22.5 %", 20)).toBe(22.5);
	});

	it("does nothing when the figure is the one saved", () => {
		expect(pourTargetToSave("20", 20)).toBeNull();
		expect(pourTargetToSave("20.0", 20)).toBeNull();
	});

	it("does nothing for a blank or out-of-range figure (the field says why)", () => {
		expect(pourTargetToSave("", 20)).toBeNull();
		expect(pourTargetToSave("abc", 20)).toBeNull();
		expect(pourTargetToSave("0", 20)).toBeNull();
		expect(pourTargetToSave("140", 20)).toBeNull();
	});
});
