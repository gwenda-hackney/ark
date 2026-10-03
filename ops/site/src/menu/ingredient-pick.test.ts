import { describe, expect, it } from "vitest";
import type { InventoryItem } from "../inventory/types";
import {
	addLabel,
	exactStock,
	lineFromStock,
	matchStock,
	pickCatalog,
	unitForStock,
} from "./ingredient-pick";

const stock = (fields: Partial<InventoryItem>): InventoryItem => fields as InventoryItem;

const inventory = [
	stock({ _id: "3", name: "Tonic", defaultUnit: "each" }),
	stock({ _id: "1", name: "Roku gin", fullName: "Roku Japanese gin" }),
	stock({ _id: "2", name: "Ginger beer" }),
	stock({ _id: "4", name: "Old gin", active: false }),
	stock({ _id: "5", name: "Lime juice", fullName: "Fresh lime" }),
];

describe("ingredient picker (#158)", () => {
	it("lists active stock A to Z", () => {
		expect(pickCatalog(inventory).map((row) => row.name)).toEqual([
			"Ginger beer",
			"Lime juice",
			"Roku gin",
			"Tonic",
		]);
	});

	it("puts names that start with what's typed first, then any that contain it", () => {
		const catalog = pickCatalog(inventory);
		expect(matchStock(catalog, "gin").map((row) => row.name)).toEqual(["Ginger beer", "Roku gin"]);
		expect(matchStock(catalog, "fresh").map((row) => row.name)).toEqual(["Lime juice"]);
		expect(exactStock(catalog, " roku GIN ")?._id).toBe("1");
		expect(exactStock(catalog, "roku")).toBeUndefined();
	});

	it("takes the stock's own unit once picked, unless the unit was changed by hand", () => {
		const tonic = inventory[0];
		expect(unitForStock(tonic, "ml", false)).toBe("each");
		expect(unitForStock(tonic, "cl", true)).toBe("cl");
		expect(unitForStock(inventory[1], "ml", false)).toBe("ml");
	});

	it("makes the line from the stock, leaving off a quantity that isn't a number", () => {
		expect(lineFromStock(inventory[1], "50", "ml")).toEqual({
			name: "Roku gin",
			unit: "ml",
			inventoryId: "1",
			quantity: 50,
		});
		expect("quantity" in lineFromStock(inventory[1], "a splash", "ml")).toBe(false);
	});

	it("says on the button what goes in", () => {
		expect(addLabel(null, "", "ml", "add")).toBe("Pick an ingredient to add");
		expect(addLabel(inventory[1], "50", "ml", "add")).toBe("Add 50 ml Roku gin");
		expect(addLabel(inventory[0], "", "each", "edit")).toBe("Use Tonic");
	});
});
