import { describe, expect, it } from "vitest";
import {
	followRecipe,
	metricOverridden,
	recipeFigures,
	settleOverrides,
	withOverride,
} from "./metric-lock";
import type { Ingredient, MenuItem } from "./types";

const inventory = [{ _id: "1", abv: "40" }];
/** 50 ml at 40% and 50 ml at 0%: 20%, 100 ml. */
const recipe: Ingredient[] = [
	{ name: "Gin", quantity: 50, unit: "ml", inventoryId: "1" },
	{ name: "Tonic", quantity: 50, unit: "ml" },
];
const figures = { abv: "20%", volume: "100 ml" };

function cocktail(extra: Partial<MenuItem> = {}): MenuItem {
	return { name: "G&T", drinkType: "cocktail", ingredients: recipe, abv: "20%", volume: "100 ml", ...extra };
}

describe("recipeFigures", () => {
	it("works out ABV and volume as they are stored", () => {
		expect(recipeFigures("cocktail", recipe, inventory)).toEqual(figures);
	});

	it("says nothing for drinks without a recipe or lines without amounts", () => {
		expect(recipeFigures("beer", recipe, inventory)).toEqual({ abv: "", volume: "" });
		expect(recipeFigures("cocktail", [{ name: "Mint", quantity: 3, unit: "sprig" }], inventory)).toEqual({
			abv: "",
			volume: "",
		});
	});
});

describe("settleOverrides", () => {
	it("locks figures that are the recipe's", () => {
		const settled = settleOverrides(cocktail(), inventory);
		expect(settled.abvOverride).toBe(false);
		expect(settled.volumeOverride).toBe(false);
	});

	it("opens a figure stored before the flags, and not the recipe's, as set by hand", () => {
		const settled = settleOverrides(cocktail({ abv: "18%" }), inventory);
		expect(settled.abvOverride).toBe(true);
		expect(settled.volumeOverride).toBe(false);
		expect(settled.abv).toBe("18%");
	});

	it("keeps a saved override and leaves other drinks alone", () => {
		expect(settleOverrides(cocktail({ volumeOverride: true }), inventory).volumeOverride).toBe(true);
		const beer: MenuItem = { name: "IPA", drinkType: "beer", abv: "5%" };
		expect(settleOverrides(beer, inventory)).toBe(beer);
	});

	it("returns the same object when nothing changes", () => {
		const settled = settleOverrides(cocktail(), inventory);
		expect(settleOverrides(settled, inventory)).toBe(settled);
	});
});

describe("metricOverridden", () => {
	it("trusts a settled flag, and the rule until then", () => {
		expect(metricOverridden(cocktail({ abvOverride: false, abv: "18%" }), "abv", figures)).toBe(false);
		expect(metricOverridden(cocktail({ abvOverride: true }), "abv", figures)).toBe(true);
		expect(metricOverridden(cocktail({ abv: "18%" }), "abv", figures)).toBe(true);
		expect(metricOverridden(cocktail(), "abv", figures)).toBe(false);
	});

	it("treats every figure on a drink without a recipe as typed", () => {
		expect(metricOverridden({ name: "IPA", drinkType: "beer" }, "abv", figures)).toBe(true);
	});
});

describe("followRecipe", () => {
	const doubled = { abv: "26.7%", volume: "150 ml" };

	it("moves locked figures with the recipe and leaves ones set by hand", () => {
		expect(followRecipe(cocktail({ abvOverride: false, volumeOverride: true, volume: "120 ml" }), figures, doubled)).toEqual({
			abv: "26.7%",
		});
	});

	it("clears a locked figure the recipe can no longer work out", () => {
		expect(followRecipe(cocktail({ abvOverride: false, volumeOverride: false }), figures, { abv: "", volume: "" })).toEqual({
			abv: "",
			volume: "",
		});
	});

	it("judges an unsettled flag against the recipe before the change", () => {
		expect(followRecipe(cocktail(), figures, doubled)).toEqual(doubled);
		expect(followRecipe(cocktail({ abv: "18%" }), figures, doubled)).toEqual({ volume: "150 ml" });
	});

	it("does nothing on drinks without a recipe", () => {
		expect(followRecipe({ name: "IPA", drinkType: "beer" }, figures, doubled)).toEqual({});
	});
});

describe("withOverride", () => {
	it("Override keeps the figure shown and marks it set by hand", () => {
		expect(withOverride(cocktail({ abvOverride: false }), "abv", true, figures)).toMatchObject({
			abvOverride: true,
			abv: "20%",
		});
		// Nothing stored yet: start from the recipe's figure.
		expect(withOverride(cocktail({ abv: "" }), "abv", true, figures).abv).toBe("20%");
	});

	it("Use recipe value locks it again on the recipe's figure", () => {
		expect(withOverride(cocktail({ volumeOverride: true, volume: "120 ml" }), "volume", false, figures)).toMatchObject({
			volumeOverride: false,
			volume: "100 ml",
		});
	});
});
