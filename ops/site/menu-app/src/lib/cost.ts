import { quantityToMl } from "./abv.ts";
import { inventoryItemPath, namesClash } from "../../../functions/_lib/spa-path.js";
import {
	normalizeDrinkType,
	parseGbp,
	formatGbp,
	pourTargetFor,
	priceLabels,
	type DrinkType,
	type Ingredient,
	type InventoryItem,
	type InventoryKind,
	type InventorySupplier,
	type MenuItem,
	type PourTargetMap,
} from "./types.ts";

function roundMl(value: number): number {
	return Math.round(value * 10) / 10;
}

function inventoryById(
	inventory: InventoryItem[] | null | undefined,
): Map<string, InventoryItem> {
	const map = new Map<string, InventoryItem>();
	for (const item of inventory || []) {
		const id = String(item._id || item.id || "").trim();
		if (id) map.set(id, item);
	}
	return map;
}

function stockHref(stock: InventoryItem | undefined): string | undefined {
	const path = inventoryItemPath(stock?.name || "");
	return path.startsWith("/inventory/") ? path : undefined;
}

function findStock(
	ing: Ingredient,
	catalog: Map<string, InventoryItem>,
): InventoryItem | undefined {
	const invId = ing.inventoryId != null ? String(ing.inventoryId).trim() : "";
	if (invId && catalog.has(invId)) return catalog.get(invId);
	const name = String(ing.name || "").trim();
	if (!name) return undefined;
	for (const item of catalog.values()) {
		if (namesClash(item.name, name)) return item;
	}
	return undefined;
}

const KIND_UNIT_ML: Record<InventoryKind, number> = {
	liquor: 700,
	liqueur: 700,
	wine: 750,
	beer: 330,
	syrup: 700,
	juice: 1000,
	bitter: 200,
	mixer: 1000,
	garnish: 0,
	other: 700,
};

const COUNT_UNITS = new Set(["each", "slice", "wedge", "sprig", "pinch"]);

export type PackVolumeSource = "pack-code" | "label" | "kind-default";

export type CostSource = "trade" | "item-estimate" | "kind-estimate";

export type KindCostEstimate = {
	cost: number;
	packMl: number | null;
	per: "pack" | "each";
	variable: boolean;
	label: string;
};

/** Stand-in pack cost when stock has no supplier price and no item estimate. */
export const KIND_COST_ESTIMATES: Record<InventoryKind, KindCostEstimate> = {
	liquor: { cost: 18, packMl: 700, per: "pack", variable: false, label: "700 ml bottle" },
	liqueur: { cost: 16, packMl: 700, per: "pack", variable: false, label: "700 ml bottle" },
	wine: { cost: 8, packMl: 750, per: "pack", variable: false, label: "75 cl bottle" },
	beer: { cost: 2, packMl: 330, per: "pack", variable: false, label: "330 ml" },
	syrup: { cost: 8, packMl: 700, per: "pack", variable: false, label: "700 ml bottle" },
	juice: { cost: 4, packMl: 1000, per: "pack", variable: true, label: "litre" },
	bitter: { cost: 10, packMl: 200, per: "pack", variable: false, label: "20 cl bottle" },
	mixer: { cost: 1.2, packMl: 1000, per: "pack", variable: false, label: "litre" },
	garnish: { cost: 0.15, packMl: null, per: "each", variable: true, label: "piece" },
	other: { cost: 5, packMl: 700, per: "pack", variable: false, label: "700 ml" },
};

export function kindCostEstimate(
	kind: InventoryKind | undefined,
): KindCostEstimate {
	return KIND_COST_ESTIMATES[kind || "other"];
}

export function isVariableKind(kind: InventoryKind | undefined): boolean {
	return kindCostEstimate(kind).variable;
}

export type PackVolumeSource = "pack-code" | "label" | "kind-default";

export type PackVolume = {
	units: number;
	unitMl: number | null;
	packMl: number | null;
	source: PackVolumeSource;
};

export type IngredientCostLine = {
	name: string;
	quantity: number | null;
	unit: string;
	ml: number | null;
	cost: number | null;
	costPerMl: number | null;
	supplierName: string;
	pack: string;
	packPrice: number | null;
	packMl: number | null;
	assumedSize: boolean;
	estimated: boolean;
	variable: boolean;
	source: CostSource | null;
	missing: "unlinked" | "no-price" | "no-volume" | null;
	/** Inventory editor when this line is tied to stock. */
	href?: string;
};

export type RecipePriceAnalysis = {
	drinkType: DrinkType;
	targetPourCost: number;
	lines: IngredientCostLine[];
	pricedLines: number;
	estimatedLines: number;
	variableLines: number;
	missingLines: number;
	complete: boolean;
	hasEstimates: boolean;
	/** Primary (single / pint / unit) serve. Mirrored from `serves[0]`. */
	drinkCost: number | null;
	actualPrice: number | null;
	actualPourCost: number | null;
	targetPrice: number | null;
	suggestedPrice: number | null;
	variance: number | null;
	margin: number | null;
	/** Primary and optional alt (double / half) pour readings. */
	serves: ServePourReading[];
};

export type ServePourKey = "primary" | "alt";

export type ServePourReading = {
	key: ServePourKey;
	label: string;
	/** Cost relative to the recipe / serve line (1 for primary, 2 for double, 0.5 for half). */
	costFactor: number;
	drinkCost: number | null;
	price: number | null;
	pourCost: number | null;
	targetPrice: number | null;
	suggestedPrice: number | null;
	variance: number | null;
	margin: number | null;
};

/**
 * How much of the primary recipe cost the alt size uses.
 * Double pour / cocktail ≈ 2×; half pint ≈ ½. Packaged has no alt.
 */
export function altCostFactor(drinkType: DrinkType | undefined): number | null {
	switch (normalizeDrinkType(drinkType)) {
		case "beer":
		case "postmix":
			return 0.5;
		case "packaged":
			return null;
		case "pour":
		case "cocktail":
		default:
			return 2;
	}
}

function pourReading(input: {
	key: ServePourKey;
	label: string;
	costFactor: number;
	baseCost: number | null;
	price: number | null;
	complete: boolean;
	targetPourCost: number;
}): ServePourReading {
	const drinkCost =
		input.baseCost != null
			? roundMoney(input.baseCost * input.costFactor)
			: null;
	const targetPrice =
		input.complete && drinkCost != null && input.targetPourCost > 0
			? roundMoney(drinkCost / (input.targetPourCost / 100))
			: null;
	const suggestedPrice = targetPrice != null ? snapGbp(targetPrice) : null;
	const pourCost =
		input.complete &&
		drinkCost != null &&
		input.price != null &&
		input.price > 0
			? Math.round((drinkCost / input.price) * 1000) / 10
			: null;
	const variance =
		input.complete && input.price != null && targetPrice != null
			? roundMoney(input.price - targetPrice)
			: null;
	const margin =
		input.complete &&
		drinkCost != null &&
		input.price != null &&
		input.price > 0
			? Math.round(((input.price - drinkCost) / input.price) * 1000) / 10
			: null;

	return {
		key: input.key,
		label: input.label,
		costFactor: input.costFactor,
		drinkCost,
		price: input.price,
		pourCost,
		targetPrice,
		suggestedPrice,
		variance,
		margin,
	};
}

export function roundMoney(value: number): number {
	return Math.round(value * 100) / 100;
}

export function snapGbp(value: number): number {
	return Math.round(value * 2) / 2;
}

export function formatPourPercent(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "";
	const rounded = Math.round(value * 10) / 10;
	const text = Number.isInteger(rounded)
		? String(rounded)
		: rounded.toFixed(1);
	return `${text}%`;
}

export type MarginTone = "up" | "down" | "loss" | "muted";

/** Green if the drink hits the house pour-cost target, red if not, loss if below cost. */
export function marginTone(
	margin: number | null | undefined,
	pourCost: number | null | undefined,
	target: number | null | undefined,
): MarginTone {
	if (
		margin == null ||
		pourCost == null ||
		target == null ||
		!Number.isFinite(margin) ||
		!Number.isFinite(pourCost) ||
		!Number.isFinite(target)
	) {
		return "muted";
	}
	if (margin < 0) return "loss";
	if (pourCost > target) return "down";
	return "up";
}

/** Format a pour-cost percent for the grid. Tilde means estimates. */
export function formatPourLabel(
	value: number | null | undefined,
	estimated = false,
): string {
	if (value == null || !Number.isFinite(value)) return "—";
	const text = formatPourPercent(value);
	return estimated ? `~${text}` : text;
}

/** Format a drink cost for the grid. Tilde means estimates or a partial recipe. */
export function formatCostLabel(
	value: number | null | undefined,
	estimated = false,
): string {
	const text = formatGbp(value);
	if (!text) return "—";
	return estimated ? `~${text}` : text;
}

export function formatMarginLabel(
	margin: number | null | undefined,
	estimated = false,
): string {
	return formatPourLabel(margin, estimated);
}

export function marginHint(input: {
	margin: number | null | undefined;
	pourCost: number | null | undefined;
	target: number | null | undefined;
	drinkCost: number | null | undefined;
	estimated?: boolean;
	complete?: boolean;
	hasPrice?: boolean;
	serves?: ServePourReading[];
}): string {
	const tone = marginTone(input.margin, input.pourCost, input.target);
	if (tone === "muted") {
		if (!input.hasPrice) return "No menu price, so pour cost is unknown.";
		if (!input.complete) return "Recipe cost is incomplete.";
		return "Need a drink cost and a menu price.";
	}
	const parts: string[] = [];
	if (input.serves && input.serves.length > 1) {
		const sized = input.serves
			.filter((serve) => serve.pourCost != null)
			.map(
				(serve) =>
					`${serve.label} ${formatPourPercent(serve.pourCost)}`,
			);
		if (sized.length) parts.push(sized.join(" · "));
	} else if (tone === "loss") {
		parts.push("Selling below cost.");
	} else if (tone === "down") {
		parts.push("Above the house pour-cost target.");
	} else {
		parts.push("At or below the house pour-cost target.");
	}
	parts.push(
		`Target ${formatPourPercent(input.target)}.`,
	);
	if (input.drinkCost != null) {
		parts.push(`Drink cost ${formatGbp(input.drinkCost)}.`);
	}
	if (input.estimated) parts.push("Includes estimated stock costs.");
	return parts.join(" ");
}

export type PriceVerdict = {
	tone: "ok" | "high" | "low" | "loss" | "muted";
	headline: string;
	detail: string;
};

/** Short label for a serve vs the snapped house pour-cost price. */
export function priceVerdict(
	price: Pick<
		RecipePriceAnalysis,
		| "drinkCost"
		| "complete"
		| "actualPrice"
		| "margin"
		| "suggestedPrice"
		| "targetPrice"
	>,
): PriceVerdict | null {
	if (price.drinkCost == null) return null;
	if (!price.complete) {
		return {
			tone: "muted",
			headline: "Incomplete",
			detail: "Fill in trade prices on stock.",
		};
	}
	if (price.actualPrice == null) {
		return {
			tone: "muted",
			headline: "No menu price",
			detail: "Set a price",
		};
	}

	if (price.margin != null && price.margin < 0) {
		return {
			tone: "loss",
			headline: "Below cost",
			detail: "Raise the menu",
		};
	}

	const target = price.suggestedPrice ?? price.targetPrice;
	if (target == null) {
		return { tone: "ok", headline: "On target", detail: "vs target" };
	}

	const delta = roundMoney(price.actualPrice - target);
	if (delta === 0) {
		return { tone: "ok", headline: "On target", detail: "vs target" };
	}
	if (delta > 0) {
		return {
			tone: "high",
			headline: `${formatGbp(delta)} high`,
			detail: "vs target",
		};
	}
	return {
		tone: "low",
		headline: `${formatGbp(Math.abs(delta))} low`,
		detail: "vs target",
	};
}

export function serveVerdict(
	serve: ServePourReading,
	complete: boolean,
): PriceVerdict | null {
	return priceVerdict({
		drinkCost: serve.drinkCost,
		complete,
		actualPrice: serve.price,
		margin: serve.margin,
		suggestedPrice: serve.suggestedPrice,
		targetPrice: serve.targetPrice,
	});
}

/** Read 70cl / 330ml / 1L from a product name, pack, or full name. */
export function parseLabelVolumeMl(text: unknown): number | null {
	const raw = String(text || "")
		.toUpperCase()
		.replace(/,/g, " ");
	if (!raw.trim()) return null;
	const cl = raw.match(/(?:^|[^\d.])(\d+(?:\.\d+)?)\s*CL\b/);
	if (cl) {
		const n = Number(cl[1]);
		if (Number.isFinite(n) && n > 0) return n * 10;
	}
	const ml = raw.match(/(?:^|[^\d.])(\d+(?:\.\d+)?)\s*ML\b/);
	if (ml) {
		const n = Number(ml[1]);
		if (Number.isFinite(n) && n > 0) return n;
	}
	const liters = raw.match(/(?:^|[^\d.])(\d+(?:\.\d+)?)\s*L(?:ITRE|ITER)?S?\b/);
	if (liters) {
		const n = Number(liters[1]);
		if (Number.isFinite(n) && n >= 1 && n <= 100) return n * 1000;
	}
	return null;
}

export function parsePackCode(pack: unknown): {
	units: number;
	packMl: number | null;
} {
	const raw = String(pack || "")
		.trim()
		.toUpperCase();
	if (!raw) return { units: 1, packMl: null };
	const kegL = raw.match(/^KEG(\d+(?:\.\d+)?)L$/);
	if (kegL) return { units: 1, packMl: Number(kegL[1]) * 1000 };
	if (raw === "KEG11G") return { units: 1, packMl: 50000 };
	const cse = raw.match(/^CASE(\d+)$/);
	if (cse) return { units: Number(cse[1]), packMl: null };
	return { units: 1, packMl: null };
}

export function defaultUnitMl(kind: InventoryKind | undefined): number | null {
	if (!kind) return 700;
	const ml = KIND_UNIT_ML[kind];
	return ml > 0 ? ml : null;
}

export function resolvePackVolume(
	supplier: Pick<InventorySupplier, "pack" | "productUrl"> | null | undefined,
	stock: Pick<InventoryItem, "name" | "fullName" | "kind"> | null | undefined,
): PackVolume {
	const pack = String(supplier?.pack || "").trim();
	const { units, packMl: codedMl } = parsePackCode(pack);
	const hay = [
		stock?.fullName,
		stock?.name,
		pack,
		supplier?.productUrl,
	]
		.filter(Boolean)
		.join(" ");
	const labelled = parseLabelVolumeMl(hay);
	if (codedMl != null && codedMl > 0) {
		return {
			units,
			unitMl: units > 0 ? codedMl / units : codedMl,
			packMl: codedMl,
			source: "pack-code",
		};
	}
	const unitMl = labelled ?? defaultUnitMl(stock?.kind);
	if (unitMl == null || unitMl <= 0) {
		return { units, unitMl: null, packMl: null, source: "kind-default" };
	}
	return {
		units,
		unitMl,
		packMl: units * unitMl,
		source: labelled != null ? "label" : "kind-default",
	};
}

export function pickPricedSupplier(
	stock: InventoryItem | null | undefined,
): InventorySupplier | null {
	const priced = (stock?.suppliers || [])
		.map((entry) => ({ entry, price: parseGbp(entry.price) }))
		.filter(
			(row): row is { entry: InventorySupplier; price: number } =>
				row.price != null && row.price > 0,
		)
		.sort((a, b) => a.price - b.price);
	return priced[0]?.entry || null;
}

export type PriceBasis = "trade" | "item-estimate" | "kind-estimate";

/** How recipe cost is sourced when this stock line has no trade price. */
export function priceBasis(
	item: InventoryItem | null | undefined,
): PriceBasis {
	if (pickPricedSupplier(item)) return "trade";
	const itemEst = parseGbp(item?.estimatedCost);
	if (itemEst != null && itemEst > 0) return "item-estimate";
	return "kind-estimate";
}

export function priceBasisLabel(
	item: InventoryItem | null | undefined,
): string {
	const basis = priceBasis(item);
	if (basis === "trade") return "Trade";
	if (basis === "item-estimate") return "Item estimate";
	return "Kind estimate";
}

function parseQty(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) {
		return value;
	}
	if (typeof value !== "string") return null;
	const n = Number(value.replace(/,/g, "").trim());
	if (!Number.isFinite(n) || n <= 0) return null;
	return n;
}

export function costIngredientLine(
	ing: Ingredient,
	catalog: Map<string, InventoryItem>,
): IngredientCostLine {
	const name = String(ing.name || "").trim() || "Unnamed";
	const unit = String(ing.unit || "").trim();
	const quantity = parseQty(ing.quantity);
	const ml = quantityToMl(ing.quantity, ing.unit);
	const invId = ing.inventoryId != null ? String(ing.inventoryId).trim() : "";
	const stock = invId ? catalog.get(invId) : undefined;
	const href = stockHref(stock) || stockHref(findStock(ing, catalog));
	const base: IngredientCostLine = {
		name,
		quantity,
		unit,
		ml: ml != null ? roundMl(ml) : null,
		cost: null,
		costPerMl: null,
		supplierName: "",
		pack: "",
		packPrice: null,
		packMl: null,
		assumedSize: false,
		estimated: false,
		variable: false,
		source: null,
		missing: null,
		...(href ? { href } : {}),
	};

	if (!invId) {
		return { ...base, missing: String(ing.name || "").trim() ? "unlinked" : "no-volume" };
	}
	if (!stock) return { ...base, missing: "unlinked" };

	const kind = stock.kind;
	const variable = isVariableKind(kind);
	const trade = pickPricedSupplier(stock);
	if (trade) {
		const packPrice = parseGbp(trade.price);
		const volume = resolvePackVolume(trade, stock);
		const packMl = volume.packMl;
		if (packPrice != null && packPrice > 0) {
			const next: IngredientCostLine = {
				...base,
				supplierName: trade.name || "",
				pack: String(trade.pack || "").trim(),
				packPrice,
				packMl,
				assumedSize: volume.source === "kind-default",
				estimated: false,
				variable: false,
				source: "trade",
			};
			if (ml != null && packMl != null && packMl > 0) {
				const costPerMl = packPrice / packMl;
				return {
					...next,
					costPerMl,
					cost: roundMoney(ml * costPerMl),
					missing: null,
				};
			}
			const countUnit = COUNT_UNITS.has(unit.toLowerCase());
			if (countUnit && quantity != null && volume.units > 0) {
				const costEach = packPrice / volume.units;
				return {
					...next,
					cost: roundMoney(quantity * costEach),
					missing: null,
				};
			}
			return { ...next, source: null, missing: "no-volume" };
		}
	}

	const estimated = applyEstimate(base, stock, ml, quantity, unit);
	if (estimated) return estimated;
	return { ...base, variable, missing: "no-price" };
}

function applyEstimate(
	base: IngredientCostLine,
	stock: InventoryItem,
	ml: number | null,
	quantity: number | null,
	unit: string,
): IngredientCostLine | null {
	const kind = stock.kind;
	const variable = isVariableKind(kind);
	const kindEst = kindCostEstimate(kind);
	const itemEst = parseGbp(stock.estimatedCost);
	const countUnit = COUNT_UNITS.has(unit.toLowerCase());
	const volume = resolvePackVolume(null, stock);
	const packMl = volume.packMl ?? kindEst.packMl;

	if (ml != null && packMl != null && packMl > 0) {
		if (itemEst != null && itemEst > 0) {
			const costPerMl = itemEst / packMl;
			return {
				...base,
				packPrice: itemEst,
				packMl,
				assumedSize: volume.source === "kind-default",
				estimated: true,
				variable,
				source: "item-estimate",
				costPerMl,
				cost: roundMoney(ml * costPerMl),
				missing: null,
			};
		}
		if (kindEst.per === "pack" && kindEst.packMl != null && kindEst.packMl > 0) {
			const costPerMl = kindEst.cost / kindEst.packMl;
			return {
				...base,
				packPrice: kindEst.cost,
				packMl: kindEst.packMl,
				assumedSize: true,
				estimated: true,
				variable,
				source: "kind-estimate",
				costPerMl,
				cost: roundMoney(ml * costPerMl),
				missing: null,
			};
		}
	}

	if (countUnit && quantity != null) {
		if (itemEst != null && itemEst > 0) {
			return {
				...base,
				packPrice: itemEst,
				estimated: true,
				variable,
				source: "item-estimate",
				cost: roundMoney(quantity * itemEst),
				missing: null,
			};
		}
		if (kindEst.per === "each") {
			return {
				...base,
				packPrice: kindEst.cost,
				estimated: true,
				variable,
				source: "kind-estimate",
				cost: roundMoney(quantity * kindEst.cost),
				missing: null,
			};
		}
	}

	return null;
}

export function recipePriceAnalysis(
	item: MenuItem | null | undefined,
	inventory: InventoryItem[] | null | undefined,
	targets?: PourTargetMap | null,
): RecipePriceAnalysis {
	const drinkType = normalizeDrinkType(item?.drinkType);
	const targetPourCost = pourTargetFor(drinkType, targets);
	const catalog = inventoryById(inventory);
	const lines = (item?.ingredients || []).map((ing) =>
		costIngredientLine(ing, catalog),
	);
	const priced = lines.filter((line) => line.cost != null);
	const estimatedLines = lines.filter((line) => line.estimated).length;
	const variableLines = lines.filter((line) => line.variable).length;
	const missingLines = lines.filter((line) => line.missing).length;
	const baseCost =
		priced.length > 0
			? roundMoney(priced.reduce((sum, line) => sum + (line.cost || 0), 0))
			: null;
	const complete = lines.length > 0 && missingLines === 0;
	const hasEstimates = estimatedLines > 0;
	const labels = priceLabels(drinkType);
	const primary = pourReading({
		key: "primary",
		label: labels.primary,
		costFactor: 1,
		baseCost,
		price: parseGbp(item?.price),
		complete,
		targetPourCost,
	});
	const serves: ServePourReading[] = [primary];
	const altFactor = altCostFactor(drinkType);
	const altPriceRaw = String(item?.priceAlt || "").trim();
	// Alt serve is opt-in per drink (set a double / half price to enable it).
	if (labels.alt && altFactor != null && altPriceRaw) {
		serves.push(
			pourReading({
				key: "alt",
				label: labels.alt,
				costFactor: altFactor,
				baseCost,
				price: parseGbp(altPriceRaw),
				complete,
				targetPourCost,
			}),
		);
	}

	return {
		drinkType,
		targetPourCost,
		lines,
		pricedLines: priced.length,
		estimatedLines,
		variableLines,
		missingLines,
		complete,
		hasEstimates,
		drinkCost: primary.drinkCost,
		actualPrice: primary.price,
		actualPourCost: primary.pourCost,
		targetPrice: primary.targetPrice,
		suggestedPrice: primary.suggestedPrice,
		variance: primary.variance,
		margin: primary.margin,
		serves,
	};
}
