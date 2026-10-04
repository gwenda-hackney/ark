import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { isDraftDirty, parseMenuDraft, serializeMenuDraft } from "./draft-history.ts";
import { withPrices } from "./prices.js";
import type { MenuItem } from "./types.ts";

const base: MenuItem = {
	name: "Ambra",
	sectionId: "3",
	drinkType: "cocktail",
	description: "cognac, banana, tonka, lemon, orange bitters",
	ingredients: [],
};

describe("serializeMenuDraft", () => {
	it("treats an AI reading as an unsaved change", () => {
		const clean = serializeMenuDraft(base);
		const dirty = serializeMenuDraft({
			...base,
			analysisNote: {
				summary: "Cognac sour with banana and tonka.",
				concerns: [],
				questions: [],
				specKey: "k1",
			},
		});
		assert.equal(isDraftDirty(clean, dirty), true);
	});

	it("does not dirty an unchanged stored reading", () => {
		const withNote: MenuItem = {
			...base,
			analysisNote: {
				summary: "Cognac sour with banana and tonka.",
				concerns: [],
				questions: [],
				specKey: "k1",
			},
		};
		const snap = serializeMenuDraft(withNote);
		assert.equal(isDraftDirty(snap, serializeMenuDraft(withNote)), false);
	});

	it("sees a change anywhere in the price table, so undo and the unsaved guard do", () => {
		const prices = [
			{ name: "125 ml", price: "7" },
			{ name: "175 ml", price: "9" },
			{ name: "Bottle", price: "32" },
		];
		const snap = serializeMenuDraft(withPrices(base, prices));
		const third = withPrices(base, prices.map((row, i) => (i === 2 ? { ...row, price: "34" } : row)));
		assert.equal(isDraftDirty(snap, serializeMenuDraft(third)), true);
		assert.deepEqual(parseMenuDraft(serializeMenuDraft(third)).prices[2], { name: "Bottle", price: "34" });
		const added = withPrices(base, [...prices, { name: "Price 4", price: "" }]);
		assert.equal(isDraftDirty(snap, serializeMenuDraft(added)), true);
	});

	it("reads a drink without a table the same as one with its derived rows", () => {
		const old: MenuItem = { ...base, price: "12", priceAlt: "18" };
		const withRows = withPrices(old, [
			{ name: "Single", price: "12" },
			{ name: "Double", price: "18" },
		]);
		assert.equal(isDraftDirty(serializeMenuDraft(old), serializeMenuDraft(withRows)), false);
	});

	it("sees Override and Use recipe value, so undo and the unsaved guard do", () => {
		const locked = serializeMenuDraft({ ...base, abv: "20%", abvOverride: false });
		const overridden = serializeMenuDraft({ ...base, abv: "20%", abvOverride: true });
		assert.equal(isDraftDirty(locked, overridden), true);
		assert.equal(parseMenuDraft(overridden).abvOverride, true);
		// Not settled yet reads as off, so settling a locked figure isn't an edit.
		assert.equal(serializeMenuDraft({ ...base, abv: "20%" }), locked);
	});
});
