import { describe, expect, it } from "vitest";
import { firstErrorKey } from "../ui/form-errors.svelte";
import { ITEM_FIELD_ORDER, itemFieldTab, stripUnit, validateItem } from "./item-validate";

describe("validateItem", () => {
	it("passes a drink with a name and sensible figures", () => {
		expect(validateItem({ name: "Negroni", price: "12.50", abv: "24.5%", volume: "90 ml" })).toEqual({});
	});

	it("wants a price, even on a drink saved without one", () => {
		expect(validateItem({ name: "Negroni" })["f-price"]).toBe("Add a price.");
		const saved = { name: "Negroni", price: "" };
		expect(validateItem({ ...saved }, [], saved)["f-price"]).toBe("Add a price.");
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
			"f-price": "Enter an amount in pounds, like 12.50.",
			"f-abv": "Use a number from 0 to 100.",
			"f-volume": "Enter millilitres, like 120.",
		});
	});

	it("leaves a figure alone that hasn't changed since it was saved", () => {
		const saved = { name: "House white", price: "8", volume: "125/175 ml" };
		expect(validateItem({ ...saved, name: "House white wine" }, [], saved)).toEqual({});
		expect(validateItem({ ...saved, volume: "lots" }, [], saved)["f-volume"]).toBeTruthy();
	});

	it("puts name and price on Build with the rest, so a Save switches there for them (#158)", () => {
		const errors = validateItem({ name: "", abv: "x" });
		expect(firstErrorKey(errors, ITEM_FIELD_ORDER)).toBe("f-name");
		expect(itemFieldTab("f-name")).toBe("details");
		expect(itemFieldTab("f-price")).toBe("details");
		expect(itemFieldTab("f-abv")).toBe("menu");
		expect(itemFieldTab("f-volume")).toBe("menu");
		expect(itemFieldTab("f-pos-name")).toBe("menu");
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
	it("is optional, but must be an amount when given", () => {
		expect(validateItem({ name: "Negroni", price: "12" })["f-price-alt"]).toBeUndefined();
		expect(validateItem({ name: "Negroni", price: "12", priceAlt: "lots" })["f-price-alt"]).toBe(
			"Enter an amount in pounds, like 16.",
		);
		expect(itemFieldTab("f-price-alt")).toBe("details");
	});
});
