import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { recipesUsingInventory } from "./inventory-usage.ts";
import type { MenuSection } from "../app/types.ts";

const sections: MenuSection[] = [
	{
		_id: "s1",
		title: "Cocktails",
		items: [
			{
				_id: "n",
				name: "Negroni",
				ingredients: [
					{ inventoryId: "campari", name: "Campari", quantity: 25, unit: "ml" },
					{ inventoryId: "gin", name: "Gin", quantity: 25, unit: "ml" },
				],
			},
			{
				_id: "a",
				name: "Americano",
				ingredients: [
					{ inventoryId: "campari", name: "Campari", quantity: 30, unit: "ml" },
				],
			},
		],
		subsections: [
			{
				_id: "s2",
				title: "Highballs",
				items: [
					{
						_id: "g",
						name: "Gin tonic",
						ingredients: [
							{ inventoryId: "gin", name: "Gin", quantity: 50, unit: "ml" },
						],
					},
				],
			},
		],
	},
];

describe("recipesUsingInventory", () => {
	it("lists drinks that link the stock row, including nested sections", () => {
		assert.deepEqual(
			recipesUsingInventory(sections, "campari").map((row) => row.name),
			["Americano", "Negroni"],
		);
		assert.deepEqual(
			recipesUsingInventory(sections, "gin").map((row) => row.name),
			["Gin tonic", "Negroni"],
		);
		assert.equal(recipesUsingInventory(sections, "gin")[0].href, "/menu/gin-tonic");
	});

	it("returns nothing for a new or unknown item", () => {
		assert.deepEqual(recipesUsingInventory(sections, "new"), []);
		assert.deepEqual(recipesUsingInventory(sections, "vodka"), []);
		assert.deepEqual(recipesUsingInventory(sections, ""), []);
	});
});
