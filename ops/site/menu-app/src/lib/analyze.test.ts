import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
	analyzeMenuIssues,
	analyzeRecipe,
	inferDilution,
	parseAnalyzeNote,
	parseVolumeMl,
	percentile,
	recipeMetrics,
	summarizeIssues,
} from "./analyze.ts";
import type { InventoryItem, MenuItem } from "./types.ts";
import { hasRecipe, serveTabLabel } from "./types.ts";

function inv(
	id: string,
	name: string,
	kind: InventoryItem["kind"],
	abv?: string,
): InventoryItem {
	return { id, _id: id, name, kind, abv, active: true };
}

function line(
	inventoryId: string,
	name: string,
	quantity: number,
	unit = "ml",
	note?: string,
) {
	return { inventoryId, name, quantity, unit, note };
}

const inventory: InventoryItem[] = [
	inv("vr", "Vecchia Romagna Etichetta Nera", "liquor", "40"),
	inv("banana", "Banana syrup", "syrup", "0"),
	inv("tonka", "Tonka syrup", "syrup"),
	inv("lemon", "Lemon juice", "juice"),
	inv("narano", "Narano Bitter Orange", "bitter"),
	inv("mezcal", "Ojo de Dios Mezcal Joven", "liquor", "42"),
	inv("passion", "Passion fruit puree", "juice"),
	inv("lime", "Lime juice", "juice"),
	inv("agave", "Agave syrup", "syrup"),
	inv("tequila", "Buen Amigo Silver Tequila", "liquor", "38"),
	inv("grapefruit", "Grapefruit juice", "juice"),
	inv("bourbon", "Iron Wheel Kentucky Bourbon", "liquor", "40"),
	inv("fig", "Fig syrup", "syrup"),
	inv("rum", "Appleton Estate Signature Rum", "liquor", "40"),
	inv("borghetti", "Borghetti", "liqueur", "25"),
	inv("maple", "Maple syrup", "syrup"),
	inv("angostura", "Angostura Bitters", "bitter"),
];

const ambra: MenuItem = {
	_id: "ambra",
	name: "Ambra",
	drinkType: "cocktail",
	notes: "Banana and tonka",
	description:
		"Vecchia Romagna Etichetta Nera, banana syrup, tonka syrup, lemon, orange bitters",
	volume: "86.8 ml",
	ingredients: [
		line("vr", "Vecchia Romagna Etichetta Nera", 40),
		line("banana", "Banana syrup", 15),
		line("tonka", "Tonka syrup", 10),
		line("lemon", "Lemon juice", 20),
		line("narano", "Narano Bitter Orange", 2, "dash"),
	],
};

const ambraNoLemon: MenuItem = {
	...ambra,
	_id: "ambra-short",
	volume: "65 ml",
	ingredients: [
		line("vr", "Vecchia Romagna Etichetta Nera", 40),
		line("banana", "Banana syrup", 15),
		line("tonka", "Tonka syrup", 10),
	],
};

const house: MenuItem[] = [
	ambra,
	{
		_id: "paradise",
		name: "Paradise Lost",
		drinkType: "cocktail",
		ingredients: [
			line("mezcal", "Ojo de Dios Mezcal Joven", 40),
			line("passion", "Passion fruit puree", 25),
			line("lime", "Lime juice", 15),
			line("agave", "Agave syrup", 10),
		],
	},
	{
		_id: "maestrale",
		name: "Maestrale",
		drinkType: "cocktail",
		ingredients: [
			line("tequila", "Buen Amigo Silver Tequila", 40),
			line("grapefruit", "Grapefruit juice", 25),
			line("lime", "Lime juice", 15),
			line("agave", "Agave syrup", 10),
		],
	},
	{
		_id: "scirocco",
		name: "Scirocco",
		drinkType: "cocktail",
		ingredients: [
			line("bourbon", "Iron Wheel Kentucky Bourbon", 45),
			line("fig", "Fig syrup", 15),
			line("narano", "Narano Bitter Orange", 2, "dash"),
		],
	},
	{
		_id: "kraken",
		name: "Kraken",
		drinkType: "cocktail",
		ingredients: [
			line("rum", "Appleton Estate Signature Rum", 45),
			line("borghetti", "Borghetti", 15),
			line("maple", "Maple syrup", 5),
			line("angostura", "Angostura Bitters", 2, "dash"),
		],
	},
];

describe("parseVolumeMl", () => {
	it("reads stored volume strings", () => {
		assert.equal(parseVolumeMl("86.8 ml"), 86.8);
		assert.equal(parseVolumeMl("65ml"), 65);
		assert.equal(parseVolumeMl(""), null);
	});
});

describe("inferDilution", () => {
	it("reads shake from method", () => {
		const d = inferDilution("Shake, double strain", "None");
		assert.equal(d.method, "shake");
		assert.equal(d.fraction, 0.25);
		assert.equal(d.confidence, "high");
	});

	it("stays unknown when method is empty", () => {
		const d = inferDilution("", "Cubed");
		assert.equal(d.method, "unknown");
		assert.equal(d.fraction, null);
	});

	it("treats a neat pour as no dilution", () => {
		const d = inferDilution("", "", "pour");
		assert.equal(d.method, "none");
		assert.equal(d.fraction, 0);
	});
});

describe("missing method flag", () => {
	it("marks an empty method as a warning, not a reading", () => {
		const metrics = recipeMetrics(ambra, inventory);
		const flag = metrics.flags.find((row) => row.id === "method-unknown");
		assert.equal(flag?.kind, "missing");
		assert.equal(flag?.code, "method-unknown");
		assert.equal(flag?.severity, "warning");
		assert.match(flag?.message || "", /method is missing/i);
	});
});

describe("pour price analysis", () => {
	it("costs a single serve without cocktail spec flags", () => {
		const stock: InventoryItem = {
			id: "bandero",
			_id: "bandero",
			name: "Bandero Premium Blanco",
			kind: "liquor",
			abv: "40",
			suppliers: [{ name: "LWC Drinks", pack: "BOTTLE", price: 28 }],
		};
		const pour: MenuItem = {
			_id: "pour-bandero",
			name: "Bandero Premium Blanco",
			drinkType: "pour",
			price: "8",
			volume: "70cl",
			ingredients: [line("bandero", "Bandero Premium Blanco", 25)],
		};
		const analysis = analyzeRecipe(pour, [stock]);
		assert.equal(analysis.dilution.method, "none");
		assert.equal(analysis.volumeMl, 25);
		assert.equal(
			analysis.flags.some((flag) => flag.id === "method-unknown"),
			false,
		);
		assert.equal(
			analysis.flags.some((flag) => flag.id === "stored-volume-mismatch"),
			false,
		);
		assert.equal(analysis.price.drinkType, "pour");
		assert.equal(analysis.price.targetPourCost, 18);
		assert.ok(analysis.price.complete);
		assert.ok(analysis.price.drinkCost != null);
		assert.ok(analysis.price.actualPourCost != null);
		assert.equal(analysis.price.lines[0].href, "/inventory/bandero-premium-blanco");
		assert.equal(hasRecipe("pour"), false);
		assert.equal(serveTabLabel("pour"), "Serve");
	});
});

describe("percentile", () => {
	it("is 0 for the lowest sample among peers", () => {
		assert.equal(percentile(65, [90, 90, 100]), 0);
	});
});

describe("Ambra seed spec", () => {
	it("sums to 86.8 ml with a sour split, not a high ABV", () => {
		const metrics = recipeMetrics(ambra, inventory);
		assert.equal(metrics.volumeMl, 86.8);
		assert.equal(metrics.storedVolumeMatches, true);
		assert.equal(metrics.spiritMl, 40);
		assert.equal(metrics.citrusMl, 20);
		assert.equal(metrics.sweetMl, 25);
		assert.ok(metrics.specAbv != null);
		assert.ok(metrics.specAbv > 17 && metrics.specAbv < 20);
		assert.equal(
			metrics.flags.some((flag) => flag.id.startsWith("description:")),
			false,
		);
	});

	it("applies shake dilution to in-glass volume", () => {
		const shaken = recipeMetrics(
			{ ...ambra, method: "Shake hard, fine strain" },
			inventory,
		);
		assert.equal(shaken.dilution.method, "shake");
		assert.equal(shaken.inGlassMl, 108.5);
		assert.ok(shaken.inGlassAbv != null && shaken.inGlassAbv < (shaken.specAbv || 0));
	});

	it("treats orange bitters as Narano Bitter Orange", () => {
		const metrics = recipeMetrics(ambra, inventory);
		assert.equal(
			metrics.flags.some((flag) =>
				flag.message.toLowerCase().includes("orange bitter"),
			),
			false,
		);
	});
});

describe("Gwenda description vs St-Germain", () => {
	const stGermain = inv("sg", "St-Germain", "liqueur", "20");
	const gwenda: MenuItem = {
		_id: "gwenda",
		name: "Gwenda",
		drinkType: "cocktail",
		description:
			"Roku gin, Italicus, elderflower liqueur, lime, soda, basil",
		ingredients: [
			line("gin", "Roku Gin", 40),
			line("italicus", "Italicus", 15),
			line("sg", "St-Germain", 10),
			line("lime", "Lime juice", 20),
			line("soda", "Soda water", 50),
			{ inventoryId: "basil", name: "Fresh basil", quantity: 1, unit: "sprig" },
		],
	};
	const catalog: InventoryItem[] = [
		inv("gin", "Roku Gin", "liquor", "43"),
		inv("italicus", "Italicus", "liqueur", "20"),
		stGermain,
		inv("lime", "Lime juice", "juice"),
		inv("soda", "Soda water", "mixer"),
		inv("basil", "Fresh basil", "garnish"),
	];

	it("treats St-Germain as the elderflower liqueur on the guest line", () => {
		const metrics = recipeMetrics(gwenda, catalog);
		assert.equal(
			metrics.flags.some((flag) => flag.id.startsWith("description:")),
			false,
		);
	});

	it("reads full name even when the recipe line is not linked by id", () => {
		const unlinked = {
			...gwenda,
			ingredients: gwenda.ingredients.map((ing) =>
				ing.inventoryId === "sg" ? { name: "St. Germain", quantity: 10, unit: "ml" } : ing,
			),
		};
		const metrics = recipeMetrics(unlinked, [
			...catalog.filter((row) => row._id !== "sg"),
			{ ...stGermain, fullName: "St-Germain elderflower liqueur" },
		]);
		assert.equal(
			metrics.flags.some((flag) => flag.id.startsWith("description:")),
			false,
		);
	});

	it("still uses inventory full name for bottles without a brand alias", () => {
		const renamed = {
			...gwenda,
			ingredients: gwenda.ingredients.map((ing) =>
				ing.inventoryId === "sg"
					? { ...ing, name: "Maison Fleur" }
					: ing,
			),
		};
		const houseBottle = {
			id: "sg",
			_id: "sg",
			name: "Maison Fleur",
			kind: "liqueur" as const,
			abv: "20",
			active: true,
		};
		const rest = catalog.filter((row) => row._id !== "sg");
		assert.equal(
			recipeMetrics(renamed, [
				...rest,
				{ ...houseBottle, fullName: "Maison Fleur elderflower liqueur" },
			]).flags.some((flag) => flag.id.startsWith("description:")),
			false,
		);
		assert.ok(
			recipeMetrics(renamed, rest.concat(houseBottle)).flags.some((flag) =>
				flag.message.toLowerCase().includes("elderflower"),
			),
		);
	});
});

describe("Ambra without lemon", () => {
	it("is 65 ml and flags the missing lemon plus stale volume", () => {
		const analysis = analyzeRecipe(ambraNoLemon, inventory, house);
		assert.equal(analysis.volumeMl, 65);
		assert.equal(analysis.storedVolumeMatches, true);
		assert.equal(analysis.citrusMl, 0);
		assert.ok(analysis.specAbv != null && analysis.specAbv > 23);
		assert.ok(
			analysis.flags.some((flag) =>
				flag.message.toLowerCase().includes("lemon"),
			),
		);
		assert.ok(
			analysis.flags.some((flag) =>
				flag.message.toLowerCase().includes("orange bitter"),
			),
		);
		assert.ok(
			analysis.peers.nearest.some((peer) => peer.name === "Scirocco"),
		);
		assert.equal(analysis.price.targetPourCost, 20);
		assert.equal(analysis.price.complete, true);
		assert.equal(analysis.price.hasEstimates, true);
		assert.ok(analysis.flags.some((flag) => flag.id === "estimated-cost"));
		assert.equal(
			analysis.flags.some((flag) => flag.id === "incomplete-cost"),
			false,
		);
	});

	it("sits below house citrus drinks on volume", () => {
		const withLemonAt65: MenuItem = {
			...ambra,
			_id: "ambra-thin",
			volume: "65 ml",
			ingredients: [
				line("vr", "Vecchia Romagna Etichetta Nera", 30),
				line("banana", "Banana syrup", 10),
				line("tonka", "Tonka syrup", 5),
				line("lemon", "Lemon juice", 20),
			],
		};
		const analysis = analyzeRecipe(withLemonAt65, inventory, house);
		assert.equal(analysis.volumeMl, 65);
		assert.equal(analysis.storedVolumeMatches, true);
		assert.ok((analysis.peers.citrusVolumePercentile ?? 100) <= 20);
		assert.ok(analysis.flags.some((flag) => flag.id === "volume-low-vs-citrus"));
		assert.equal(
			analysis.flags.find((flag) => flag.id === "volume-low-vs-citrus")?.severity,
			"warning",
		);
	});
});

describe("issue summary", () => {
	it("treats a guest-line ingredient as critical", () => {
		const analysis = analyzeRecipe(ambraNoLemon, inventory, house);
		const lemon = analysis.flags.find((flag) => flag.code === "description");
		assert.equal(lemon?.severity, "critical");
		assert.ok(analysis.issues.critical >= 1);
		assert.ok(analysis.issues.warning >= 1);
		assert.ok(analysis.issues.byCode.some((row) => row.code === "description"));
	});

	it("rolls menu issues up for the dashboard", () => {
		const metrics = analyzeMenuIssues(house, inventory);
		assert.ok(metrics.drinkCount >= house.length);
		assert.ok(metrics.warning >= 1);
		assert.ok(metrics.byCode.some((row) => row.code === "method-unknown"));
		assert.ok(metrics.items.some((row) => row.name === "Ambra"));
	});

	it("groups unlinked lines under one code", () => {
		const summary = summarizeIssues(
			recipeMetrics(
				{
					...ambra,
					ingredients: [
						{ name: "Mystery one", quantity: 20, unit: "ml" },
						{ name: "Mystery two", quantity: 10, unit: "ml" },
					],
				},
				inventory,
			).flags,
		);
		const unlinked = summary.byCode.find((row) => row.code === "unlinked");
		assert.equal(unlinked?.count, 2);
		assert.equal(unlinked?.severity, "warning");
		assert.equal(unlinked?.kind, "missing");
	});

	it("links missing-ABV flags to the stock row, not unlinked names", () => {
		const metrics = recipeMetrics(
			{
				...ambra,
				ingredients: [
					{ inventoryId: "vr", name: "House brandy", quantity: 40, unit: "ml" },
					{ name: "Mystery gin", quantity: 20, unit: "ml" },
				],
			},
			[inv("vr", "Vecchia Romagna Etichetta Nera", "liquor")],
		);
		const missing = metrics.flags.find((flag) => flag.id === "missing-abv:House brandy");
		assert.equal(missing?.href, "/inventory/vecchia-romagna-etichetta-nera");
		assert.equal(missing?.linkText, "House brandy");
		const unlinked = metrics.flags.find((flag) => flag.id === "unlinked:Mystery gin");
		assert.ok(unlinked);
		assert.equal(unlinked?.href, undefined);
		const mysteryAbv = metrics.flags.find((flag) =>
			flag.id.startsWith("missing-abv:Mystery"),
		);
		assert.equal(mysteryAbv?.href, undefined);
	});
});

describe("parseAnalyzeNote", () => {
	it("reads JSON from a fenced model reply", () => {
		const note = parseAnalyzeNote(
			'```json\n{"summary":"Short sour.","concerns":["Small for juice drinks."],"questions":["Is lemon missing?"]}\n```',
		);
		assert.deepEqual(note, {
			summary: "Short sour.",
			concerns: ["Small for juice drinks."],
			questions: ["Is lemon missing?"],
		});
	});

	it("reads bare JSON from a chat completion", () => {
		const note = parseAnalyzeNote(
			'{"summary":"A 65ml drink.","concerns":["Lemon is missing."],"questions":[]}',
		);
		assert.equal(note?.summary, "A 65ml drink.");
		assert.deepEqual(note?.concerns, ["Lemon is missing."]);
	});
});
