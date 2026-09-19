import { analyzeRecipe, summarizeIssues } from "./analyze.ts";
import { pickPricedSupplier } from "./cost.ts";
import {
	inventoryItemPath,
	menuItemPath,
} from "../../../functions/_lib/spa-path.js";
import {
	hasRecipe,
	parseGbp,
	type InventoryItem,
	type MenuItem,
	type MenuSection,
	type PourTargetMap,
} from "./types.ts";

export type FlaggedRecipe = {
	id: string;
	name: string;
	href: string;
	critical: number;
	warning: number;
	pourCost: number | null;
	targetPourCost: number;
	margin: number | null;
	hasEstimates: boolean;
	incompleteCost: boolean;
};

export type EstimatedStock = {
	id: string;
	name: string;
	href: string;
	kind: string;
	hasItemEstimate: boolean;
};

export type DashboardSummary = {
	recipeCount: number;
	cocktailCount: number;
	recipesWithIssues: number;
	recipesWithCritical: number;
	recipesWithWarning: number;
	recipesMissingPrice: number;
	recipesWithEstimates: number;
	recipesIncompleteCost: number;
	recipesPriced: number;
	avgPourCost: number | null;
	avgTargetPourCost: number | null;
	avgGrossMargin: number | null;
	avgTargetMargin: number | null;
	marginVsTarget: number | null;
	lowestMargin: number | null;
	worstOverDelta: number | null;
	overTarget: number;
	onTarget: number;
	underTarget: number;
	recipesAtLoss: number;
	criticalFlags: number;
	warningFlags: number;
	inventoryCount: number;
	inventoryPriced: number;
	inventoryEstimated: number;
	inventoryItemEstimates: number;
	flaggedRecipes: FlaggedRecipe[];
	pourOutliers: FlaggedRecipe[];
	estimatedStock: EstimatedStock[];
};

export const ON_TARGET_BAND = 1;
/** Pour-cost points over target that fill a magnitude bar. */
export const MISS_BAR_CAP = 15;

export type Heat = "ok" | "mild" | "bad" | "severe";

export function pourDelta(
	pourCost: number | null | undefined,
	target: number,
): number | null {
	if (pourCost == null || !Number.isFinite(pourCost)) return null;
	return Math.round((pourCost - target) * 10) / 10;
}

/** 0–1 bar fill. A drink sold below cost always reads as full-scale. */
export function missMagnitude(
	delta: number | null | undefined,
	margin?: number | null,
	cap = MISS_BAR_CAP,
): number {
	if (margin != null && margin < 0) return 1;
	if (delta == null || delta <= 0) return 0;
	return Math.min(1, Math.max(delta / cap, 0.08));
}

export function issueHeat(count: number, total: number): Heat {
	if (count <= 0) return "ok";
	if (!total) return "bad";
	const share = count / total;
	if (share >= 0.25 || count >= 8) return "severe";
	if (share >= 0.1 || count >= 3) return "bad";
	return "mild";
}

export function marginHeat(
	overTarget: number,
	atLoss: number,
	priced: number,
): Heat {
	if (atLoss > 0) return "severe";
	return issueHeat(overTarget, priced);
}

/** Gross margin implied by a pour-cost target (20% pour → 80% GM). */
export function targetGrossMargin(
	pourTarget: number | null | undefined,
): number | null {
	if (pourTarget == null || !Number.isFinite(pourTarget)) return null;
	return Math.round((100 - pourTarget) * 10) / 10;
}

/** Positive = beating the house target. */
export function marginAgainstTarget(
	margin: number | null | undefined,
	pourTarget: number | null | undefined,
): number | null {
	const target = targetGrossMargin(pourTarget);
	if (margin == null || target == null || !Number.isFinite(margin)) return null;
	return Math.round((margin - target) * 10) / 10;
}

export function marginAgainstTargetHeat(
	delta: number | null | undefined,
	margin?: number | null,
): Heat {
	if (margin != null && margin < 0) return "severe";
	if (delta == null) return "ok";
	if (delta >= -ON_TARGET_BAND) return "ok";
	if (delta >= -5) return "mild";
	if (delta >= -10) return "bad";
	return "severe";
}

export function clampPercent(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(100, Math.max(0, value));
}

function average(values: number[]): number | null {
	if (!values.length) return null;
	return Math.round((values.reduce((sum, n) => sum + n, 0) / values.length) * 10) / 10;
}

function itemId(row: { _id?: string; id?: string }, fallback: string): string {
	return String(row._id || row.id || fallback);
}

function flattenSections(sections: MenuSection[] | null | undefined): MenuSection[] {
	return (sections || []).flatMap((section) => [
		section,
		...flattenSections(section.subsections || []),
	]);
}

export function menuItemsFromSections(
	sections: MenuSection[] | null | undefined,
): MenuItem[] {
	return flattenSections(sections).flatMap((section) =>
		(section.items || []).map((row) => ({ ...row, section })),
	);
}

export function isTradePriced(item: InventoryItem | null | undefined): boolean {
	return pickPricedSupplier(item) != null;
}

export function hasItemEstimate(item: InventoryItem | null | undefined): boolean {
	const n = parseGbp(item?.estimatedCost);
	return n != null && n > 0;
}

function toFlagged(
	item: MenuItem,
	index: number,
	inventory: InventoryItem[] | null | undefined,
	peers: MenuItem[],
	targets: PourTargetMap | null | undefined,
): FlaggedRecipe {
	const analysis = analyzeRecipe(item, inventory, peers, targets);
	const issues = summarizeIssues(analysis.flags);
	const name = item.name?.trim() || "Untitled";
	return {
		id: itemId(item, `recipe-${index}`),
		name,
		href: item.name?.trim() ? menuItemPath(item.name, "analysis") : "/menu",
		critical: issues.critical,
		warning: issues.warning,
		pourCost: analysis.price.actualPourCost,
		targetPourCost: analysis.price.targetPourCost,
		margin: analysis.price.margin,
		hasEstimates: analysis.price.hasEstimates,
		incompleteCost: analysis.price.missingLines > 0 || !analysis.price.complete,
	};
}

export function summarizeDashboard(
	items: MenuItem[] | null | undefined,
	inventory: InventoryItem[] | null | undefined,
	targets?: PourTargetMap | null,
): DashboardSummary {
	const recipes = items || [];
	const rows: FlaggedRecipe[] = recipes.map((item, index) =>
		toFlagged(item, index, inventory, recipes, targets),
	);

	const priced = rows.filter((row) => row.pourCost != null && row.margin != null);
	let overTarget = 0;
	let onTarget = 0;
	let underTarget = 0;
	let recipesAtLoss = 0;
	for (const row of priced) {
		const delta = (row.pourCost || 0) - row.targetPourCost;
		if (row.margin != null && row.margin < 0) recipesAtLoss += 1;
		if (delta > ON_TARGET_BAND) overTarget += 1;
		else if (delta < -ON_TARGET_BAND) underTarget += 1;
		else onTarget += 1;
	}

	const stock = (inventory || []).filter((row) => row.active !== false);
	const estimatedStock: EstimatedStock[] = stock
		.filter((row) => !isTradePriced(row))
		.map((row, index) => {
			const name = row.name?.trim() || row.fullName?.trim() || "Untitled";
			return {
				id: itemId(row, `stock-${index}`),
				name,
				href: row.name?.trim() ? inventoryItemPath(row.name) : "/inventory",
				kind: String(row.kind || "other"),
				hasItemEstimate: hasItemEstimate(row),
			};
		})
		.sort(
			(a, b) =>
				Number(a.hasItemEstimate) - Number(b.hasItemEstimate) ||
				a.name.localeCompare(b.name),
		);

	const flaggedRecipes = rows
		.filter((row) => row.critical > 0 || row.warning > 0)
		.sort(
			(a, b) =>
				b.critical - a.critical ||
				b.warning - a.warning ||
				a.name.localeCompare(b.name),
		);

	const pourOutliers = priced
		.filter((row) => (row.pourCost || 0) - row.targetPourCost > ON_TARGET_BAND)
		.sort((a, b) => {
			const da = (a.pourCost || 0) - a.targetPourCost;
			const db = (b.pourCost || 0) - b.targetPourCost;
			const loss = Number(b.margin != null && b.margin < 0) - Number(a.margin != null && a.margin < 0);
			return loss || db - da || a.name.localeCompare(b.name);
		});

	const lowestMargin = priced.length
		? Math.round(Math.min(...priced.map((row) => row.margin || 0)) * 10) / 10
		: null;
	const worstOver = pourOutliers[0];
	const worstOverDelta = worstOver
		? pourDelta(worstOver.pourCost, worstOver.targetPourCost)
		: null;
	const avgPourCost = average(priced.map((row) => row.pourCost || 0));
	const avgTargetPourCost = average(priced.map((row) => row.targetPourCost));
	const avgGrossMargin = average(priced.map((row) => row.margin || 0));

	return {
		recipeCount: rows.length,
		cocktailCount: recipes.filter((item) => hasRecipe(item.drinkType)).length,
		recipesWithIssues: flaggedRecipes.length,
		recipesWithCritical: rows.filter((row) => row.critical > 0).length,
		recipesWithWarning: rows.filter((row) => row.warning > 0).length,
		recipesMissingPrice: recipes.filter((item) => parseGbp(item.price) == null)
			.length,
		recipesWithEstimates: rows.filter((row) => row.hasEstimates).length,
		recipesIncompleteCost: rows.filter((row) => row.incompleteCost).length,
		recipesPriced: priced.length,
		avgPourCost,
		avgTargetPourCost,
		avgGrossMargin,
		avgTargetMargin: targetGrossMargin(avgTargetPourCost),
		marginVsTarget: marginAgainstTarget(avgGrossMargin, avgTargetPourCost),
		lowestMargin,
		worstOverDelta,
		overTarget,
		onTarget,
		underTarget,
		recipesAtLoss,
		criticalFlags: rows.reduce((sum, row) => sum + row.critical, 0),
		warningFlags: rows.reduce((sum, row) => sum + row.warning, 0),
		inventoryCount: stock.length,
		inventoryPriced: stock.length - estimatedStock.length,
		inventoryEstimated: estimatedStock.length,
		inventoryItemEstimates: estimatedStock.filter((row) => row.hasItemEstimate)
			.length,
		flaggedRecipes,
		pourOutliers,
		estimatedStock,
	};
}
