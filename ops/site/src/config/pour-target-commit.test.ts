import { describe, expect, it } from "vitest";
import { pourTargetDraft, pourTargetToSave } from "./pour-target-commit";

describe("pourTargetDraft: one Save for every target (#158)", () => {
	const saved = { cocktail: 20, wine: 30, beer: 25 };

	it("is clean when every figure reads as the saved one", () => {
		expect(pourTargetDraft({ cocktail: "20", wine: "30.0", beer: " 25 " }, saved)).toEqual({
			changes: {},
			errors: {},
			dirty: false,
		});
	});

	it("collects every real change for one save", () => {
		const out = pourTargetDraft({ cocktail: "22", wine: "28.5", beer: "25" }, saved);
		expect(out.changes).toEqual({ cocktail: 22, wine: 28.5 });
		expect(out.dirty).toBe(true);
	});

	it("names a figure that can't be saved, and still counts it as unsaved", () => {
		const out = pourTargetDraft({ cocktail: "", wine: "140", beer: "25" }, saved);
		expect(out.changes).toEqual({});
		expect(out.errors.cocktail).toBe("Add a target.");
		expect(out.errors.wine).toBeTruthy();
		expect(out.dirty).toBe(true);
	});
});

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
