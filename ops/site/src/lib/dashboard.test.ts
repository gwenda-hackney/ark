import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
	issueHeat,
	marginAgainstTarget,
	marginAgainstTargetHeat,
	marginHeat,
	missMagnitude,
	pourDelta,
	targetGrossMargin,
	summarizeDashboard,
} from "./dashboard.ts";
import { DEFAULT_POUR_TARGETS } from "./types.ts";
import type { InventoryItem, MenuItem } from "./types.ts";

const tradeSpirit: InventoryItem = {
	id: "vr",
	_id: "vr",
	name: "Vecchia Romagna Etichetta Nera",
	fullName: "VECCHIA ROMAGNA ETICHETTA NERA 70CL",
	kind: "liquor",
	abv: "40",
	suppliers: [{ name: "LWC Drinks", pack: "BOTTLE", price: 17.5 }],
};

const estimatedJuice: InventoryItem = {
	id: "lemon",
	_id: "lemon",
	name: "Lemon juice",
	kind: "juice",
	estimatedCost: 8,
};

const kindEstimateSyrup: InventoryItem = {
	id: "syrup",
	_id: "syrup",
	name: "Banana syrup",
	kind: "syrup",
};

const expensiveSpirit: InventoryItem = {
	id: "whisky",
	_id: "whisky",
	name: "Showpiece whisky",
	fullName: "SHOWPIECE WHISKY 70CL",
	kind: "liquor",
	abv: "43",
	suppliers: [{ name: "LWC Drinks", pack: "BOTTLE", price: 80 }],
};

function sour(overrides: Partial<MenuItem> = {}): MenuItem {
	return {
		_id: "sour",
		name: "House sour",
		drinkType: "cocktail",
		price: "12",
		ingredients: [
			{
				inventoryId: "vr",
				name: "Vecchia Romagna Etichetta Nera",
				quantity: 40,
				unit: "ml",
			},
			{ inventoryId: "lemon", name: "Lemon juice", quantity: 20, unit: "ml" },
		],
		...overrides,
	};
}

describe("summarizeDashboard", () => {
	it("counts estimated inventory and item-level stand-in costs", () => {
		const summary = summarizeDashboard(
			[],
			[tradeSpirit, estimatedJuice, kindEstimateSyrup],
			DEFAULT_POUR_TARGETS,
		);
		assert.equal(summary.inventoryCount, 3);
		assert.equal(summary.inventoryPriced, 1);
		assert.equal(summary.inventoryEstimated, 2);
		assert.equal(summary.inventoryItemEstimates, 1);
		assert.equal(summary.estimatedStock[0].name, "Banana syrup");
		assert.equal(summary.estimatedStock[0].hasItemEstimate, false);
		assert.equal(summary.estimatedStock[1].name, "Lemon juice");
		assert.equal(summary.estimatedStock[1].hasItemEstimate, true);
		assert.equal(summary.estimatedStock[1].href, "/inventory/lemon-juice");
	});

	it("flags recipes with warnings and reports gross margin", () => {
		const priced = sour({
			_id: "priced",
			name: "House sour",
			price: "14",
			method: "shake",
		});
		const expensive = sour({
			_id: "dear",
			name: "Dear old fashion",
			price: "8",
			method: "stir",
			ingredients: [
				{
					inventoryId: "whisky",
					name: "Showpiece whisky",
					quantity: 50,
					unit: "ml",
				},
			],
		});
		const summary = summarizeDashboard(
			[priced, expensive],
			[tradeSpirit, estimatedJuice, expensiveSpirit],
			DEFAULT_POUR_TARGETS,
		);
		assert.equal(summary.recipeCount, 2);
		assert.ok(summary.recipesWithWarning >= 1);
		assert.ok(summary.recipesWithIssues >= 1);
		assert.ok(summary.flaggedRecipes.some((row) => row.name === "Dear old fashion"));
		assert.equal(
			summary.flaggedRecipes.find((row) => row.name === "Dear old fashion")?.href,
			"/menu/dear-old-fashion/analysis",
		);
		assert.ok(summary.recipesPriced >= 1);
		assert.ok(summary.avgGrossMargin != null);
		assert.ok(summary.avgPourCost != null);
		assert.equal(summary.avgTargetPourCost, 20);
		assert.equal(summary.avgTargetMargin, 80);
		assert.ok(summary.marginVsTarget != null);
		assert.ok(summary.overTarget >= 1);
		assert.ok(summary.pourOutliers.some((row) => row.name === "Dear old fashion"));
		assert.ok(summary.lowestMargin != null);
		assert.ok((summary.worstOverDelta || 0) > 0);
		assert.equal(
			summary.pourOutliers.every(
				(row) => (row.pourCost || 0) - row.targetPourCost > 1,
			),
			true,
		);
	});

	it("treats a missing menu price as a gap, not a pour-cost reading", () => {
		const summary = summarizeDashboard(
			[sour({ price: "", method: "shake" })],
			[tradeSpirit, estimatedJuice],
			DEFAULT_POUR_TARGETS,
		);
		assert.equal(summary.recipesMissingPrice, 1);
		assert.equal(summary.recipesPriced, 0);
		assert.equal(summary.avgGrossMargin, null);
		assert.equal(summary.overTarget, 0);
		assert.equal(summary.lowestMargin, null);
		assert.equal(summary.worstOverDelta, null);
	});
});

describe("dashboard magnitude", () => {
	it("treats a negative margin as a full-scale miss", () => {
		assert.equal(missMagnitude(2, -4), 1);
		assert.equal(missMagnitude(3, 40), 0.2);
		assert.equal(missMagnitude(-2, 82), 0);
		assert.equal(pourDelta(null, 20), null);
		assert.equal(pourDelta(28.44, 20), 8.4);
	});

	it("heats issue counts by how much of the menu is hit", () => {
		assert.equal(issueHeat(0, 12), "ok");
		assert.equal(issueHeat(1, 20), "mild");
		assert.equal(issueHeat(3, 20), "bad");
		assert.equal(issueHeat(8, 40), "severe");
		assert.equal(marginHeat(1, 1, 10), "severe");
		assert.equal(marginHeat(0, 0, 10), "ok");
		assert.equal(targetGrossMargin(20), 80);
		assert.equal(marginAgainstTarget(86, 20), 6);
		assert.equal(marginAgainstTarget(74, 20), -6);
		assert.equal(marginAgainstTargetHeat(6, 86), "ok");
		assert.equal(marginAgainstTargetHeat(-6, 74), "bad");
		assert.equal(marginAgainstTargetHeat(-2, 78), "mild");
		assert.equal(marginAgainstTargetHeat(4, -3), "severe");
	});
});
