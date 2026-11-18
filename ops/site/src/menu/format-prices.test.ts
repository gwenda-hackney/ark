import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { formatPrices, poundsLabel } from "./types";

describe("formatPrices: an item's prices as ops shows them", () => {
	it("keeps whole pounds plain and gives pence two digits", () => {
		assert.equal(formatPrices({ prices: [{ name: "", price: "4.5" }, { name: "Large", price: "14" }] }), "£4.50 / £14");
		assert.equal(formatPrices({ prices: [{ name: "", price: "12.75" }] }), "£12.75");
		assert.equal(formatPrices({ prices: [] }), "");
	});

	it("leaves something that isn't a number as it was", () => {
		assert.equal(poundsLabel("MP"), "MP");
		assert.equal(poundsLabel("6.0"), "6");
	});
});
