import { posScreensLabel } from "../features/inventory/lightspeed-stock.js";
import {
	analyzeRecipe,
	isIssue,
	summarizeIssues,
} from "./analyze.ts";
import {
	computeRecipeAbv,
	computeRecipeVolumeMl,
	formatAbv,
	formatVolumeMl,
	inventoryAbvById,
	parseAbvPercent,
} from "./abv.ts";
import {
	formatCostLabel,
	formatPourLabel,
	marginHint,
	marginTone,
	parseLabelVolumeMl,
	type MarginTone,
} from "./cost.ts";
import {
	fieldHits,
	hiddenMatchHint,
	itemMatchesSearch,
	recipeSearchFields,
	type MatchHint,
} from "./search.ts";
import {
	cocktailTypeLabel,
	drinkTypeLabel,
	formatPrices,
	guestMenuLabel,
	guestMenuPlacement,
	lightspeedStatusLabel,
	normalizeDrinkType,
	parseGbp,
	posMenusLabel,
	publishNotLive,
	type InventoryItem,
	type MenuItem,
	type MenuSection,
	type PourTargetMap,
} from "./types.ts";

export type MenuListItem = MenuItem & {
	_kind: "item";
	sectionId: string;
	section?: { _id?: string; title?: string; parentTitle?: string };
	_publishPending?: boolean;
	_publishCount?: number;
	_priceLabel?: string;
	_sellPrice?: number | null;
	_typeLabel?: string;
	/** Cocktail build: Spritz, Highball, Stirred, etc. */
	_categoryLabel?: string;
	_cost?: number | null;
	_costLabel?: string;
	_costHint?: string;
	_pourCost?: number | null;
	_pourLabel?: string;
	_pourTone?: MarginTone | "";
	_pourHint?: string;
	_issueCount?: number;
	_issueLabel?: string;
	_issueTone?: "loss" | "down" | "";
	_issueHint?: string;
	_abv?: number | null;
	_abvLabel?: string;
	_volumeMl?: number | null;
	_volumeLabel?: string;
	_sectionOrder?: number;
	_matchHint?: MatchHint | null;
	_posLabel?: string;
	_posStatus?: string;
	_guestLabel?: string;
	_guestPlacement?: string;
	_posMenusLabel?: string;
	_posScreensLabel?: string;
};

export type MenuListGroup = {
	_kind: "group";
	_id: string;
	title: string;
	subtitle?: string;
	count: number;
	_sectionOrder: number;
};

export type MenuListRow = MenuListItem | MenuListGroup;

export type MenuListSort = "section" | "price" | "pour";

function compareNullable(
	av: number | null | undefined,
	bv: number | null | undefined,
): number {
	if (av == null && bv == null) return 0;
	if (av == null) return 1;
	if (bv == null) return -1;
	return av - bv;
}

function sectionLabel(item: MenuItem): string {
	const parent = item.section?.parentTitle;
	const title = item.section?.title;
	if (parent && title) return `${parent} / ${title}`;
	return title || "—";
}

function categoryLabel(item: MenuItem): string {
	if (normalizeDrinkType(item.drinkType) !== "cocktail") return "—";
	return cocktailTypeLabel(item.cocktailType) || "—";
}

function abvFor(
	item: MenuItem,
	byId: ReturnType<typeof inventoryAbvById>,
): { percent: number | null; label: string } {
	const percent =
		computeRecipeAbv(item.ingredients, byId) ?? parseAbvPercent(item.abv);
	return {
		percent,
		label: percent != null ? formatAbv(percent) : "—",
	};
}

function volumeFor(item: MenuItem): { ml: number | null; label: string } {
	const fromRecipe = computeRecipeVolumeMl(item.ingredients);
	if (fromRecipe != null) {
		return { ml: fromRecipe, label: formatVolumeMl(fromRecipe) };
	}
	const stored = String(item.volume || "").trim();
	return { ml: parseLabelVolumeMl(stored), label: stored || "—" };
}

function costHint(price: {
	drinkCost: number | null;
	hasEstimates: boolean;
	complete: boolean;
}): string {
	if (price.drinkCost == null) {
		return price.complete === false
			? "Recipe cost is incomplete."
			: "No drink cost yet.";
	}
	const parts = [`Drink cost ${formatCostLabel(price.drinkCost)}.`];
	if (!price.complete) parts.push("Recipe cost is incomplete.");
	if (price.hasEstimates) parts.push("Includes estimated stock costs.");
	return parts.join(" ");
}

function issueHint(
	critical: number,
	warning: number,
	messages: string[],
): string {
	const total = critical + warning;
	if (total <= 0) return "No analysis issues.";
	const head = [
		critical > 0 ? `${critical} critical` : "",
		warning > 0 ? `${warning} warning${warning === 1 ? "" : "s"}` : "",
	]
		.filter(Boolean)
		.join(", ");
	const detail = messages.slice(0, 4).join(" · ");
	return detail ? `${head}. ${detail}` : `${head}.`;
}

function allMenuItems(sections: MenuSection[]): MenuItem[] {
	const chapters = [...sections].sort(
		(a, b) => (a.orderRank ?? 0) - (b.orderRank ?? 0),
	);
	const out: MenuItem[] = [];
	for (const chapter of chapters) {
		for (const block of [chapter, ...(chapter.subsections || [])]) {
			for (const item of block.items || []) {
				out.push({
					...item,
					section: item.section || {
						_id: block._id,
						title: block.title,
						parentTitle: block.parentId ? chapter.title : undefined,
					},
					sectionId: item.sectionId || block._id,
				});
			}
		}
	}
	return out;
}

export function buildMenuListRows(opts: {
	sections: MenuSection[];
	inventory: InventoryItem[];
	query: string;
	targets: PourTargetMap;
}): MenuListRow[] {
	const { sections, inventory, query, targets } = opts;
	const needle = query.trim();
	const chapters = [...sections].sort(
		(a, b) => (a.orderRank ?? 0) - (b.orderRank ?? 0),
	);
	const byId = inventoryAbvById(inventory);
	const peers = allMenuItems(sections);

	const out: MenuListRow[] = [];
	let order = 0;
	for (const chapter of chapters) {
		const blocks = [chapter, ...(chapter.subsections || [])];
		for (const block of blocks) {
			const items = (block.items || [])
				.map((item): MenuItem => ({
					...item,
					section: item.section || {
						_id: block._id,
						title: block.title,
						parentTitle: block.parentId ? chapter.title : undefined,
					},
					sectionId: item.sectionId || block._id,
				}))
				.flatMap((item): MenuListItem[] => {
					const fields = recipeSearchFields(item, sectionLabel(item));
					if (!itemMatchesSearch(fields, needle)) return [];
					const analysis = analyzeRecipe(item, inventory, peers, targets);
					const price = analysis.price;
					const issues = summarizeIssues(analysis.flags);
					const issueMessages = analysis.flags
						.filter(isIssue)
						.map((flag) => flag.message);
					const issueCount = issues.critical + issues.warning;
					const abv = abvFor(item, byId);
					const volume = volumeFor(item);
					const costApprox =
						price.hasEstimates ||
						(price.drinkCost != null && !price.complete);
					return [
						{
							...item,
							_kind: "item",
							sectionId: item.sectionId || block._id,
							_publishPending: publishNotLive(item.publish),
							_publishCount: item.publish?.production?.changed?.length || 0,
							_priceLabel: formatPrices(item) || "—",
							_sellPrice: parseGbp(item.price),
							_typeLabel: drinkTypeLabel(normalizeDrinkType(item.drinkType)),
							_categoryLabel: categoryLabel(item),
							_cost: price.drinkCost,
							_costLabel: formatCostLabel(price.drinkCost, costApprox),
							_costHint: costHint(price),
							_pourCost: price.actualPourCost,
							_pourLabel: formatPourLabel(
								price.actualPourCost,
								price.hasEstimates,
							),
							_pourTone: marginTone(
								price.margin,
								price.actualPourCost,
								price.targetPourCost,
							),
							_pourHint: marginHint({
								margin: price.margin,
								pourCost: price.actualPourCost,
								target: price.targetPourCost,
								drinkCost: price.drinkCost,
								estimated: price.hasEstimates,
								complete: price.complete,
								hasPrice: parseGbp(item.price) != null,
								serves: price.serves,
							}),
							_issueCount: issueCount,
							_issueLabel: issueCount > 0 ? String(issueCount) : "—",
							_issueTone:
								issues.critical > 0
									? "loss"
									: issues.warning > 0
										? "down"
										: "",
							_issueHint: issueHint(
								issues.critical,
								issues.warning,
								issueMessages,
							),
							_abv: abv.percent,
							_abvLabel: abv.label,
							_volumeMl: volume.ml,
							_volumeLabel: volume.label,
							_sectionOrder: order,
							_matchHint: hiddenMatchHint(fieldHits(fields, needle), needle),
							_posLabel: lightspeedStatusLabel(item.lightspeedStatus) || "—",
							_posStatus: item.lightspeedStatus || "",
							_posMenusLabel: posMenusLabel(item.posMenus),
							_posScreensLabel: posScreensLabel(item) || "None",
							_guestPlacement: guestMenuPlacement(item),
							_guestLabel: guestMenuLabel(guestMenuPlacement(item)),
						},
					];
				})
				.sort((a, b) =>
					String(a.name || "").localeCompare(String(b.name || "")),
				);
			if (!items.length) continue;
			out.push({
				_kind: "group",
				_id: `section:${block._id}`,
				title:
					block._id === chapter._id
						? chapter.title || "Untitled"
						: block.title || "Untitled",
				subtitle:
					block._id === chapter._id ? undefined : chapter.title || undefined,
				count: items.length,
				_sectionOrder: order,
			});
			out.push(...items);
			order += 1;
		}
	}
	return out;
}

export function sortMenuListRows(
	rows: MenuListRow[],
	sort: MenuListSort,
): MenuListRow[] {
	if (sort === "section") return rows;
	const groups: { header: MenuListGroup; items: MenuListItem[] }[] = [];
	let current: { header: MenuListGroup; items: MenuListItem[] } | null = null;
	for (const row of rows) {
		if (row._kind === "group") {
			current = { header: row, items: [] };
			groups.push(current);
		} else if (current) {
			current.items.push(row);
		}
	}
	const out: MenuListRow[] = [];
	for (const group of groups) {
		group.items.sort((a, b) => {
			if (sort === "price") {
				return compareNullable(b._sellPrice, a._sellPrice);
			}
			return compareNullable(b._pourCost, a._pourCost);
		});
		out.push(group.header, ...group.items);
	}
	return out;
}

export { compareNullable };
