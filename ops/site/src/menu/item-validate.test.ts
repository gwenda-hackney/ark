import { describe, expect, it } from "vitest";
import { firstErrorKey } from "../ui/form-errors.svelte";
import { ITEM_FIELD_ORDER, itemFieldTab, priceFieldId, stripUnit, validateItem, validatePrices } from "./item-validate";

describe("validateItem", () => {
	it("passes a drink with a name and sensible figures", () => {
		expect(validateItem({ name: "Negroni", price: "12.50", abv: "24.5%", volume: "90 ml" })).toEqual({});
	});

	it("wants a price, even on a drink saved without one", () => {
		expect(validateItem({ name: "Negroni" })["f-price-0"]).toBe("Add a price.");
		const saved = { name: "Negroni", price: "" };
		expect(validateItem({ ...saved }, [], saved)["f-price-0"]).toBe("Add a price.");
	});

	it("wants a name, and one no other drink has", () => {
		expect(validateItem({ name: " ", price: "12" })["f-name"]).toBe("Add a name.");
		expect(
			validateItem({ _id: "a", name: "negroni", price: "12" }, [
				{ _id: "a", name: "Negroni" },
				{ _id: "b", name: "Negroni" },
			])["f-name"],
		).toBe("A drink with that name already exists.");
		expect(validateItem({ _id: "a", name: "Negroni", price: "12" }, [{ _id: "a", name: "Negroni" }])).toEqual({});
	});

	it("says what's wrong with a figure", () => {
		const errors = validateItem({ name: "X", price: "twelve", abv: "140%", volume: "lots" });
		expect(errors).toEqual({
			"f-price-0": "Enter an amount in pounds, like 12.50.",
			"f-abv": "Use a number from 0 to 100.",
			"f-volume": "Enter millilitres, like 120.",
		});
	});

	it("leaves a figure alone that hasn't changed since it was saved", () => {
		const saved = { name: "House white", price: "8", volume: "125/175 ml" };
		expect(validateItem({ ...saved, name: "House white wine" }, [], saved)).toEqual({});
		expect(validateItem({ ...saved, volume: "lots" }, [], saved)["f-volume"]).toBeTruthy();
		const odd = { name: "House white", prices: [{ name: "Glass", price: "8/9" }] };
		expect(validateItem({ ...odd, name: "House white wine" }, [], odd)).toEqual({});
	});

	it("goes to Build for the name, Menu for ABV, and Pricing for prices (#158)", () => {
		const errors = validateItem({ name: "", abv: "x" });
		expect(firstErrorKey(errors, ITEM_FIELD_ORDER)).toBe("f-name");
		expect(itemFieldTab("f-name")).toBe("details");
		expect(itemFieldTab("f-abv")).toBe("menu");
		expect(itemFieldTab("f-volume")).toBe("menu");
		expect(itemFieldTab("f-pos-name")).toBe("menu");
		expect(itemFieldTab("f-price-0")).toBe("cost");
		expect(itemFieldTab("f-price-name-3")).toBe("cost");
	});

	it("orders price rows after the Menu tab, each row's name before its amount", () => {
		const errors = validateItem({
			name: "Gin and tonic",
			prices: [
				{ name: "Single", price: "8" },
				{ name: "", price: "" },
			],
		});
		expect(firstErrorKey(errors, ITEM_FIELD_ORDER)).toBe("f-price-name-1");
		expect(ITEM_FIELD_ORDER.indexOf("f-price-0")).toBeGreaterThan(ITEM_FIELD_ORDER.indexOf("f-pos-name"));
	});
});

describe("validatePrices", () => {
	it("passes rows with names and amounts", () => {
		expect(
			validatePrices([
				{ name: "125 ml", price: "7" },
				{ name: "175 ml", price: "9.50" },
				{ name: "Bottle", price: "34" },
			]),
		).toEqual({});
	});

	it("wants a name and an amount on every row", () => {
		expect(
			validatePrices([
				{ name: "Single", price: "8" },
				{ name: " ", price: "lots" },
				{ name: "Large", price: "" },
			]),
		).toEqual({
			"f-price-name-1": "Add a name.",
			"f-price-1": "Enter an amount in pounds, like 16.",
			"f-price-2": "Add a price.",
		});
	});

	it("wants each row's name to be its own", () => {
		expect(
			validatePrices([
				{ name: "Single", price: "8" },
				{ name: "single", price: "10" },
			]),
		).toEqual({ "f-price-name-1": "Another price has this name." });
	});

	it("names its field ids by row", () => {
		expect(priceFieldId("price", 0)).toBe("f-price-0");
		expect(priceFieldId("name", 1)).toBe("f-price-name-1");
		expect(priceFieldId("sku", 2)).toBe("f-price-sku-2");
	});
});

describe("stripUnit", () => {
	it("shows the figure without the stored unit", () => {
		expect(stripUnit("12.5%", "%")).toBe("12.5");
		expect(stripUnit("120 ml", "ml")).toBe("120");
		expect(stripUnit("", "ml")).toBe("");
	});
});

describe("second price", () => {
	it("from the old slot must be an amount", () => {
		expect(validateItem({ name: "Negroni", price: "12" })["f-price-1"]).toBeUndefined();
		expect(validateItem({ name: "Negroni", price: "12", priceAlt: "lots" })["f-price-1"]).toBe(
			"Enter an amount in pounds, like 16.",
		);
	});
});
