import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	marginTone,
	formatCostLabel,
	formatMarginLabel,
	formatPourLabel,
	parseLabelVolumeMl,
	parsePackCode,
	priceVerdict,
	recipePriceAnalysis,
	resolvePackVolume,
	snapGbp,
} from "./cost.ts";
import { DEFAULT_POUR_TARGETS, UK_PINT_ML, defaultServeQuantity } from "./types.ts";
import type { InventoryItem, MenuItem } from "./types.ts";

describe("parseLabelVolumeMl", () => {
	it("reads UK spirit bottles and beer cans", () => {
		assert.equal(parseLabelVolumeMl("IRON WHEEL BOURBON 70CL"), 700);
		assert.equal(parseLabelVolumeMl("PERONI NASTRO AZZURRO NRB 330ML"), 330);
		assert.equal(parseLabelVolumeMl("Fever-Tree 1L"), 1000);
	});
});

describe("formatCostLabel", () => {
	it("shows pounds, with a tilde when the figure is estimated", () => {
		assert.equal(formatCostLabel(1.2), "£1.20");
		assert.equal(formatCostLabel(1.2, true), "~£1.20");
		assert.equal(formatCostLabel(null), "—");
	});
});

describe("defaultServeQuantity", () => {
	it("costs draught beer on a UK pint and pours on a single", () => {
		assert.deepEqual(defaultServeQuantity("beer"), {
			quantity: UK_PINT_ML,
			unit: "ml",
		});
		assert.equal(defaultServeQuantity("beer")?.quantity, 568);
		assert.deepEqual(defaultServeQuantity("pour"), {
			quantity: 25,
			unit: "ml",
		});
		assert.equal(defaultServeQuantity("cocktail"), null);
		assert.equal(defaultServeQuantity("packaged"), null);
	});
});

describe("parsePackCode", () => {
	it("reads kegs and cases", () => {
		assert.deepEqual(parsePackCode("KEG30L"), { units: 1, packMl: 30000 });
		assert.deepEqual(parsePackCode("KEG11G"), { units: 1, packMl: 50000 });
		assert.deepEqual(parsePackCode("CASE24"), { units: 24, packMl: null });
		assert.deepEqual(parsePackCode("BOTTLE"), { units: 1, packMl: null });
	});
});

describe("resolvePackVolume", () => {
	it("uses 70cl from the bottle name", () => {
		const volume = resolvePackVolume(
			{ pack: "BOTTLE" },
			{ name: "Iron Wheel Kentucky Bourbon", fullName: "IRON WHEEL BOURBON 70CL", kind: "liquor" },
		);
		assert.equal(volume.packMl, 700);
		assert.equal(volume.source, "label");
	});

	it("falls back to a 700ml spirit bottle when the label has no size", () => {
		const volume = resolvePackVolume(
			{ pack: "BOTTLE" },
			{ name: "Iron Wheel Kentucky Bourbon", kind: "liquor" },
		);
		assert.equal(volume.packMl, 700);
		assert.equal(volume.source, "kind-default");
	});
});

describe("Ambra pour cost at 20%", () => {
	const inventory: InventoryItem[] = [
		{
			id: "vr",
			_id: "vr",
			name: "Vecchia Romagna Etichetta Nera",
			fullName: "VECCHIA ROMAGNA ETICHETTA NERA 70CL",
			kind: "liquor",
			abv: "40",
			suppliers: [{ name: "LWC Drinks", pack: "BOTTLE", price: 17.5 }],
		},
		{
			id: "banana",
			_id: "banana",
			name: "Banana syrup",
			kind: "syrup",
			suppliers: [{ name: "Hills Prospect", pack: "BOTTLE", price: 8.4 }],
		},
		{
			id: "tonka",
			_id: "tonka",
			name: "Tonka syrup",
			kind: "syrup",
			suppliers: [{ name: "Hills Prospect", pack: "BOTTLE", price: 8.4 }],
		},
		{
			id: "lemon",
			_id: "lemon",
			name: "Lemon juice",
			kind: "juice",
			suppliers: [{ name: "Hills Prospect", pack: "BOTTLE", price: 4.2 }],
		},
		{
			id: "narano",
			_id: "narano",
			name: "Narano Bitter Orange",
			fullName: "NARANO BITTER ORANGE 20CL",
			kind: "bitter",
			suppliers: [{ name: "LWC Drinks", pack: "BOTTLE", price: 9.8 }],
		},
	];

	const ambra: MenuItem = {
		_id: "ambra",
		name: "Ambra",
		drinkType: "cocktail",
		price: "14",
		ingredients: [
			{ inventoryId: "vr", name: "Vecchia Romagna Etichetta Nera", quantity: 40, unit: "ml" },
			{ inventoryId: "banana", name: "Banana syrup", quantity: 15, unit: "ml" },
			{ inventoryId: "tonka", name: "Tonka syrup", quantity: 10, unit: "ml" },
			{ inventoryId: "lemon", name: "Lemon juice", quantity: 20, unit: "ml" },
			{ inventoryId: "narano", name: "Narano Bitter Orange", quantity: 2, unit: "dash" },
		],
	};

	it("costs the spec and prices to a 20% cocktail target", () => {
		const price = recipePriceAnalysis(ambra, inventory, DEFAULT_POUR_TARGETS);
		assert.equal(price.targetPourCost, 20);
		assert.equal(price.complete, true);
		assert.ok(price.drinkCost != null);
		assert.equal(price.actualPrice, 14);
		assert.ok(price.targetPrice != null);
		assert.equal(price.targetPrice, Math.round((price.drinkCost / 0.2) * 100) / 100);
		assert.equal(price.suggestedPrice, snapGbp(price.targetPrice));
		assert.ok(price.actualPourCost != null);
		assert.ok(price.actualPourCost > 0 && price.actualPourCost < 20);
		const spirit = price.lines.find((line) => line.name.includes("Vecchia"));
		assert.ok(spirit);
		assert.equal(spirit.packMl, 700);
		assert.equal(spirit.cost, Math.round((40 * 17.5) / 700 * 100) / 100);
	});

	it("uses the house map when cocktail is not 20%", () => {
		const price = recipePriceAnalysis(ambra, inventory, {
			...DEFAULT_POUR_TARGETS,
			cocktail: 22,
		});
		assert.equal(price.targetPourCost, 22);
		assert.ok(price.drinkCost != null && price.targetPrice != null);
		assert.equal(price.targetPrice, Math.round((price.drinkCost / 0.22) * 100) / 100);
	});

	it("formats a grid pour label, with a tilde for estimates", () => {
		assert.equal(formatPourLabel(17.5, false), "17.5%");
		assert.equal(formatPourLabel(20, true), "~20%");
		assert.equal(formatPourLabel(null), "—");
		assert.equal(formatMarginLabel(87.8, false), "87.8%");
	});

	it("tones by house pour-cost target and below-cost loss", () => {
		assert.equal(marginTone(80, 20, 20), "up");
		assert.equal(marginTone(86, 14, 20), "up");
		assert.equal(marginTone(75, 25, 20), "down");
		assert.equal(marginTone(-10, 110, 20), "loss");
		assert.equal(marginTone(null, 20, 20), "muted");
	});

	it("raises pour cost and lowers margin when the menu price drops", () => {
		const dear = recipePriceAnalysis(ambra, inventory, DEFAULT_POUR_TARGETS);
		const cheap = recipePriceAnalysis(
			{ ...ambra, price: "10" },
			inventory,
			DEFAULT_POUR_TARGETS,
		);
		assert.ok(dear.actualPourCost != null && cheap.actualPourCost != null);
		assert.ok(dear.margin != null && cheap.margin != null);
		assert.ok(cheap.actualPourCost > dear.actualPourCost);
		assert.ok(cheap.margin < dear.margin);
		assert.equal(
			Math.round((dear.actualPourCost + dear.margin) * 10) / 10,
			100,
		);
	});

	it("only includes a double serve when an alt price is set", () => {
		const singleOnly = recipePriceAnalysis(
			{ ...ambra, price: "14", priceAlt: "" },
			inventory,
			DEFAULT_POUR_TARGETS,
		);
		assert.equal(singleOnly.serves.length, 1);
		assert.equal(singleOnly.serves[0].label, "Single");

		const price = recipePriceAnalysis(
			{ ...ambra, price: "14", priceAlt: "20" },
			inventory,
			DEFAULT_POUR_TARGETS,
		);
		assert.equal(price.serves.length, 2);
		assert.equal(price.serves[0].label, "Single");
		assert.equal(price.serves[1].label, "Double");
		assert.equal(price.serves[1].costFactor, 2);
		assert.ok(price.drinkCost != null);
		assert.equal(price.serves[1].drinkCost, Math.round(price.drinkCost * 2 * 100) / 100);
		assert.ok(price.serves[0].pourCost != null);
		assert.ok(price.serves[1].pourCost != null);
		assert.equal(
			price.serves[1].pourCost,
			Math.round(((price.drinkCost * 2) / 20) * 1000) / 10,
		);
	});

	it("uses half-pint cost for beer alt serve", () => {
		const beerInv: InventoryItem[] = [
			{
				id: "lager",
				_id: "lager",
				name: "House lager",
				kind: "beer",
				suppliers: [{ name: "LWC", pack: "KEG30L", price: 60 }],
			},
		];
		const beer: MenuItem = {
			name: "Lager",
			drinkType: "beer",
			price: "6",
			priceAlt: "3.5",
			ingredients: [
				{ inventoryId: "lager", name: "House lager", quantity: UK_PINT_ML, unit: "ml" },
			],
		};
		const price = recipePriceAnalysis(beer, beerInv, DEFAULT_POUR_TARGETS);
		assert.equal(price.serves.length, 2);
		assert.equal(price.serves[0].label, "Pint");
		assert.equal(price.serves[1].label, "Half pint");
		assert.equal(price.serves[1].costFactor, 0.5);
		assert.ok(price.drinkCost != null && price.serves[1].drinkCost != null);
		assert.equal(
			price.serves[1].drinkCost,
			Math.round(price.drinkCost * 0.5 * 100) / 100,
		);
	});

	it("states the price issue as a short verdict", () => {
		const base = recipePriceAnalysis(ambra, inventory, DEFAULT_POUR_TARGETS);
		assert.ok(base.suggestedPrice != null);
		assert.deepEqual(priceVerdict(base), {
			tone: "high",
			headline: `£${(14 - base.suggestedPrice).toFixed(2)} high`,
			detail: "vs target",
		});

		const cheapPrice = Math.round((base.suggestedPrice - 2) * 100) / 100;
		const cheap = recipePriceAnalysis(
			{ ...ambra, price: String(cheapPrice) },
			inventory,
			DEFAULT_POUR_TARGETS,
		);
		assert.ok(cheap.suggestedPrice != null);
		const low = priceVerdict(cheap);
		assert.equal(low?.tone, "low");
		assert.equal(low?.headline, "£2.00 low");
		assert.equal(low?.detail, "vs target");

		const onTarget = recipePriceAnalysis(
			{ ...ambra, price: String(base.suggestedPrice) },
			inventory,
			DEFAULT_POUR_TARGETS,
		);
		assert.deepEqual(priceVerdict(onTarget), {
			tone: "ok",
			headline: "On target",
			detail: "vs target",
		});

		assert.deepEqual(
			priceVerdict(
				recipePriceAnalysis(
					{ ...ambra, price: undefined },
					inventory,
					DEFAULT_POUR_TARGETS,
				),
			),
			{
				tone: "muted",
				headline: "No menu price",
				detail: "Set a price",
			},
		);
	});
});

describe("estimated cost", () => {
	it("uses an item estimate when there is no trade price", () => {
		const lemon: InventoryItem = {
			id: "lemon",
			_id: "lemon",
			name: "Lemon juice",
			kind: "juice",
			estimatedCost: 8,
		};
		const drink: MenuItem = {
			name: "Sour",
			drinkType: "cocktail",
			price: "12",
			ingredients: [
				{ inventoryId: "lemon", name: "Lemon juice", quantity: 20, unit: "ml" },
			],
		};
		const price = recipePriceAnalysis(drink, [lemon], DEFAULT_POUR_TARGETS);
		assert.equal(price.complete, true);
		assert.equal(price.hasEstimates, true);
		assert.equal(price.variableLines, 1);
		assert.equal(price.drinkCost, 0.16);
		const line = price.lines[0];
		assert.equal(line.source, "item-estimate");
		assert.equal(line.variable, true);
		assert.equal(line.href, "/inventory/lemon-juice");
	});

	it("falls back to a house kind estimate, and prefers a trade price", () => {
		const spirit: InventoryItem = {
			id: "vr",
			_id: "vr",
			name: "Vecchia Romagna Etichetta Nera",
			kind: "liquor",
		};
		const drink: MenuItem = {
			name: "Pour",
			drinkType: "cocktail",
			ingredients: [
				{ inventoryId: "vr", name: "Vecchia Romagna Etichetta Nera", quantity: 40, unit: "ml" },
			],
		};
		const estimated = recipePriceAnalysis(drink, [spirit], DEFAULT_POUR_TARGETS);
		assert.equal(estimated.lines[0].source, "kind-estimate");
		assert.equal(estimated.lines[0].href, "/inventory/vecchia-romagna-etichetta-nera");
		assert.equal(estimated.drinkCost, Math.round((40 * 18) / 700 * 100) / 100);

		const traded = recipePriceAnalysis(
			drink,
			[
				{
					...spirit,
					estimatedCost: 40,
					suppliers: [{ name: "LWC Drinks", pack: "BOTTLE", price: 17.5 }],
				},
			],
			DEFAULT_POUR_TARGETS,
		);
		assert.equal(traded.lines[0].source, "trade");
		assert.equal(traded.hasEstimates, false);
		assert.equal(traded.drinkCost, Math.round((40 * 17.5) / 700 * 100) / 100);
	});
});
