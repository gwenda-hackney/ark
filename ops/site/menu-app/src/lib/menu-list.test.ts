import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMenuListRows, sortMenuListRows } from "./menu-list.ts";
import { DEFAULT_POUR_TARGETS } from "./types.ts";

describe("menu-list", () => {
	it("builds a section header plus matching drinks", () => {
		const rows = buildMenuListRows({
			sections: [
				{
					_id: "s1",
					title: "Cocktails",
					orderRank: 1,
					items: [
						{ _id: "a", name: "Ambra", drinkType: "cocktail", price: "12" },
						{ _id: "n", name: "Negroni", drinkType: "cocktail", price: "11" },
					],
				},
			],
			inventory: [],
			query: "",
			targets: DEFAULT_POUR_TARGETS,
		});
		assert.equal(rows[0]?._kind, "group");
		if (rows[0]?._kind !== "group") return;
		assert.equal(rows[0].title, "Cocktails");
		assert.equal(rows[0].count, 2);
		assert.equal(rows.filter((row) => row._kind === "item").length, 2);
	});

	it("filters by search before grouping", () => {
		const rows = buildMenuListRows({
			sections: [
				{
					_id: "s1",
					title: "Cocktails",
					items: [
						{ _id: "a", name: "Ambra", drinkType: "cocktail" },
						{ _id: "n", name: "Negroni", drinkType: "cocktail" },
					],
				},
			],
			inventory: [],
			query: "neg",
			targets: DEFAULT_POUR_TARGETS,
		});
		assert.equal(rows.length, 2);
		assert.equal(rows[1]?._kind, "item");
		if (rows[1]?._kind !== "item") return;
		assert.equal(rows[1].name, "Negroni");
	});

	it("sorts items inside a section by price high to low", () => {
		const rows = buildMenuListRows({
			sections: [
				{
					_id: "s1",
					title: "Cocktails",
					items: [
						{ _id: "a", name: "Ambra", drinkType: "cocktail", price: "10" },
						{ _id: "n", name: "Negroni", drinkType: "cocktail", price: "14" },
					],
				},
			],
			inventory: [],
			query: "",
			targets: DEFAULT_POUR_TARGETS,
		});
		const sorted = sortMenuListRows(rows, "price");
		const items = sorted.filter((row) => row._kind === "item");
		assert.equal(items[0]?._kind, "item");
		if (items[0]?._kind !== "item" || items[1]?._kind !== "item") return;
		assert.equal(items[0].name, "Negroni");
		assert.equal(items[1].name, "Ambra");
	});

	it("counts analysis issues on cocktail rows", () => {
		const rows = buildMenuListRows({
			sections: [
				{
					_id: "s1",
					title: "Cocktails",
					items: [
						{
							_id: "a",
							name: "Ambra",
							drinkType: "cocktail",
							price: "12",
							ingredients: [
								{ name: "Gin", quantity: 40, unit: "ml" },
								{ name: "Lemon", quantity: 20, unit: "ml" },
							],
						},
					],
				},
			],
			inventory: [],
			query: "",
			targets: DEFAULT_POUR_TARGETS,
		});
		const item = rows.find((row) => row._kind === "item");
		assert.equal(item?._kind, "item");
		if (item?._kind !== "item") return;
		assert.ok((item._issueCount || 0) > 0);
		assert.notEqual(item._issueLabel, "—");
	});

	it("labels cocktail rows with cocktail type as category", () => {
		const rows = buildMenuListRows({
			sections: [
				{
					_id: "our-formulas",
					title: "Our Formulas",
					orderRank: 1,
					items: [
						{
							_id: "a",
							name: "Aperol Spritz",
							drinkType: "cocktail",
							cocktailType: "spritz",
						},
						{
							_id: "b",
							name: "House Gin",
							drinkType: "pour",
						},
					],
				},
			],
			inventory: [],
			query: "",
			targets: DEFAULT_POUR_TARGETS,
		});
		const spritz = rows.find(
			(row) => row._kind === "item" && row.name === "Aperol Spritz",
		);
		const pour = rows.find(
			(row) => row._kind === "item" && row.name === "House Gin",
		);
		assert.equal(spritz?._kind, "item");
		assert.equal(pour?._kind, "item");
		if (spritz?._kind !== "item" || pour?._kind !== "item") return;
		assert.equal(spritz._categoryLabel, "Spritz");
		assert.equal(pour._categoryLabel, "—");
	});
});
