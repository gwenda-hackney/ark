import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { menuItemPayload } from "./item-payload";

describe("menuItemPayload", () => {
	it("sends each channel's placement as it is (#151)", () => {
		const placements = [
			{ channel: "print" as const, sectionId: "1" },
			{ channel: "digital" as const, sectionId: "2" },
		];
		const payload = menuItemPayload({ name: "Negroni", sectionId: "1", placements });
		assert.deepEqual(payload.placements, placements);
	});

	it("sends the price table with the old price and SKU fields filled from its first two rows", () => {
		const prices = [
			{ name: "Single", size: "25 ml", price: "8", sku: "G1" },
			{ name: "Double", size: "50 ml", price: "10" },
			{ name: "Triple", size: "75 ml", price: "14", sku: "G3" },
		];
		const payload = menuItemPayload({ name: "Gin", drinkType: "pour", prices, price: "8", priceAlt: "10" });
		assert.deepEqual(payload.prices, prices);
		assert.equal(payload.price, "8");
		assert.equal(payload.priceAlt, "10");
		assert.equal(payload.lightspeedSku, "G1");
		assert.equal(payload.lightspeedSkuAlt, "");
	});

	it("builds the table from the old fields for a drink that has none", () => {
		const payload = menuItemPayload({ name: "Lager", drinkType: "beer", price: "6", priceAlt: "3.5" });
		assert.deepEqual(payload.prices, [
			{ name: "Pint", size: "Pint", price: "6" },
			{ name: "Half pint", size: "Half pint", price: "3.5" },
		]);
	});

	it("leaves placements out for a new drink that has none yet, so the server fills them from the section", () => {
		const payload = menuItemPayload({ name: "Negroni", sectionId: "1" });
		assert.equal("placements" in payload, false);
	});

	it("sends the ABV and volume overrides once the editor has settled them, and leaves them out before", () => {
		const settled = menuItemPayload({ name: "Gin tonic", abv: "18%", abvOverride: true, volumeOverride: false });
		assert.equal(settled.abvOverride, true);
		assert.equal(settled.volumeOverride, false);
		const unsettled = menuItemPayload({ name: "Gin tonic", abv: "18%" });
		assert.equal("abvOverride" in unsettled, false);
		assert.equal("volumeOverride" in unsettled, false);
	});
});
