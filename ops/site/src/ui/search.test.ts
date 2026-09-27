import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
	fieldHits,
	hiddenMatchHint,
	highlightParts,
	itemMatchesSearch,
	recipeSearchFields,
	snippetAround,
} from "./search.ts";
import type { MenuItem } from "../app/types.ts";

const ponente: MenuItem = {
	_id: "ponente",
	name: "Ponente",
	drinkType: "cocktail",
	notes: "Bitter aperitivo",
	description: "Gin, Montenegro, sweet vermouth",
	method: "Stirred, down",
	ingredients: [
		{ name: "Gin", quantity: 30, unit: "ml" },
		{ name: "Montenegro", quantity: 20, unit: "ml" },
		{ name: "Sweet vermouth", quantity: 20, unit: "ml" },
	],
};

describe("highlightParts", () => {
	it("marks every case-insensitive hit in source casing", () => {
		assert.deepEqual(highlightParts("Montenegro", "negr"), [
			{ text: "Monte", hit: false },
			{ text: "negr", hit: true },
			{ text: "o", hit: false },
		]);
	});

	it("returns the raw string when the query is empty", () => {
		assert.deepEqual(highlightParts("Ponente", "  "), [
			{ text: "Ponente", hit: false },
		]);
	});
});

describe("snippetAround", () => {
	it("keeps the match in view", () => {
		const text = snippetAround(
			"Gin, Montenegro, sweet vermouth",
			"negr",
			8,
		);
		assert.equal(text.includes("Montenegro"), true);
		assert.equal(text.startsWith("…") || text.startsWith("Gin"), true);
	});
});

describe("recipe search", () => {
	const fields = recipeSearchFields(ponente, "Cocktails / House");

	it("treats negr as a description hit, not the drink name", () => {
		assert.equal(itemMatchesSearch(fields, "negr"), true);
		const hits = fieldHits(fields, "negr");
		assert.deepEqual(
			hits.map((hit) => hit.key).sort(),
			["description", "ingredients"],
		);
		assert.equal(
			hits.some((hit) => hit.key === "name"),
			false,
		);
		const hint = hiddenMatchHint(hits, "negr");
		assert.equal(hint?.label, "Menu description");
		assert.equal(hint?.text.includes("Montenegro"), true);
	});

	it("does not invent a hint when the name column already shows the hit", () => {
		const hits = fieldHits(fields, "ponen");
		assert.deepEqual(
			hits.map((hit) => hit.key),
			["name"],
		);
		assert.equal(hiddenMatchHint(hits, "ponen"), null);
	});

	it("matches method and garnish when they are not on the grid", () => {
		assert.equal(itemMatchesSearch(fields, "stirred"), true);
		const hint = hiddenMatchHint(fieldHits(fields, "stirred"), "stirred");
		assert.equal(hint?.label, "Method");
	});

	it("does not invent a hint when tasting note is already on the grid", () => {
		assert.equal(itemMatchesSearch(fields, "aperitivo"), true);
		const hits = fieldHits(fields, "aperitivo");
		assert.deepEqual(
			hits.map((hit) => hit.key),
			["notes"],
		);
		assert.equal(hiddenMatchHint(hits, "aperitivo"), null);
	});

	it("treats cocktail type as the category column", () => {
		const withType = recipeSearchFields(
			{ ...ponente, cocktailType: "spritz" },
			"Our Formulas",
		);
		assert.equal(itemMatchesSearch(withType, "spritz"), true);
		const hits = fieldHits(withType, "spritz");
		assert.ok(hits.some((hit) => hit.key === "category"));
		assert.equal(
			hiddenMatchHint(
				hits.filter((hit) => hit.key === "category"),
				"spritz",
			),
			null,
		);
	});
});
