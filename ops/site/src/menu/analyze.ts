import {
	computeRecipeAbv,
	computeRecipeVolumeMl,
	inventoryAbvById,
	parseAbvPercent,
	quantityToMl,
	resolveIngredientAbv,
} from "./abv.ts";
import { formatPourPercent, recipePriceAnalysis } from "./cost.ts";
import type { RecipePriceAnalysis } from "./cost.ts";
import { itemSlug } from "./item-key.js";
import { inventoryItemPath } from "../app/spa-path.js";
import { type InventoryItem } from "../inventory/types.ts";
import { hasRecipe, normalizeDrinkType, type DrinkType, type Ingredient, type MenuItem, type PourTargetMap } from "./types.ts";

const KIND_ML_KEYS = [
	"liquor",
	"liqueur",
	"wine",
	"beer",
	"syrup",
	"juice",
	"bitter",
	"mixer",
	"garnish",
	"other",
	"unknown",
] as const;

export type KindMlKey = (typeof KIND_ML_KEYS)[number];

export type KindMl = Record<KindMlKey, number>;

export type DilutionMethod = "shake" | "stir" | "built" | "none" | "unknown";

export type FlagKind = "missing" | "note";
export type FlagSeverity = "note" | "warning" | "critical";

export type RecipeFlag = {
	id: string;
	/** Stable code for dashboard rollups. `unlinked:Gin` groups as `unlinked`. */
	code: string;
	severity: FlagSeverity;
	kind: FlagKind;
	message: string;
	/** Inventory editor when the flag names a stock row. */
	href?: string;
	/** Linked portion of `message` (usually the stock name). */
	linkText?: string;
};

export function flagCode(id: string): string {
	const cut = id.indexOf(":");
	return cut > 0 ? id.slice(0, cut) : id;
}

export function isIssue(flag: RecipeFlag): boolean {
	return flag.severity === "warning" || flag.severity === "critical";
}

function makeFlag(
	id: string,
	severity: FlagSeverity,
	kind: FlagKind,
	message: string,
	href?: string,
	linkText?: string,
): RecipeFlag {
	return {
		id,
		code: flagCode(id),
		severity,
		kind,
		message,
		...(href ? { href } : {}),
		...(linkText ? { linkText } : {}),
	};
}

function severityRank(severity: FlagSeverity): number {
	if (severity === "critical") return 2;
	if (severity === "warning") return 1;
	return 0;
}

export type CodeIssueCount = {
	code: string;
	severity: FlagSeverity;
	kind: FlagKind;
	count: number;
};

export type RecipeIssueSummary = {
	critical: number;
	warning: number;
	notes: number;
	byCode: CodeIssueCount[];
};

export function summarizeIssues(flags: RecipeFlag[]): RecipeIssueSummary {
	const byCode = new Map<string, CodeIssueCount>();
	let critical = 0;
	let warning = 0;
	let notes = 0;
	for (const flag of flags) {
		if (flag.severity === "critical") critical += 1;
		else if (flag.severity === "warning") warning += 1;
		else notes += 1;
		const existing = byCode.get(flag.code);
		if (existing) {
			existing.count += 1;
			if (severityRank(flag.severity) > severityRank(existing.severity)) {
				existing.severity = flag.severity;
				existing.kind = flag.kind;
			}
		} else {
			byCode.set(flag.code, {
				code: flag.code,
				severity: flag.severity,
				kind: flag.kind,
				count: 1,
			});
		}
	}
	return {
		critical,
		warning,
		notes,
		byCode: [...byCode.values()].sort((a, b) => {
			const rank = severityRank(b.severity) - severityRank(a.severity);
			return rank !== 0 ? rank : b.count - a.count || a.code.localeCompare(b.code);
		}),
	};
}

export type DrinkIssueRow = {
	id: string;
	name: string;
	critical: number;
	warning: number;
	flags: RecipeFlag[];
};

export type MenuIssueMetrics = {
	drinkCount: number;
	drinksWithCritical: number;
	drinksWithWarning: number;
	critical: number;
	warning: number;
	byCode: Array<CodeIssueCount & { drinks: number }>;
	items: DrinkIssueRow[];
};

/** Roll-up for the ops overview: counts and per-drink issues, ready to chart. */
export function analyzeMenuIssues(
	items: MenuItem[] | null | undefined,
	inventory: InventoryItem[] | null | undefined,
	targets?: PourTargetMap | null,
): MenuIssueMetrics {
	const catalog = items || [];
	const byCode = new Map<
		string,
		CodeIssueCount & { drinks: number; seen: Set<string> }
	>();
	const rows: DrinkIssueRow[] = [];
	let drinkCount = 0;
	let drinksWithCritical = 0;
	let drinksWithWarning = 0;
	let critical = 0;
	let warning = 0;

	for (const item of catalog) {
		drinkCount += 1;
		const analysis = analyzeRecipe(item, inventory, catalog, targets);
		const issueFlags = analysis.flags.filter(isIssue);
		const id =
			String(item._id || item.id || "").trim() || `row:${drinkCount}`;
		const name = String(item.name || "Untitled").trim() || "Untitled";
		if (analysis.issues.critical > 0) drinksWithCritical += 1;
		if (analysis.issues.warning > 0) drinksWithWarning += 1;
		critical += analysis.issues.critical;
		warning += analysis.issues.warning;
		if (issueFlags.length) {
			rows.push({
				id,
				name,
				critical: analysis.issues.critical,
				warning: analysis.issues.warning,
				flags: issueFlags,
			});
		}
		for (const flag of issueFlags) {
			let entry = byCode.get(flag.code);
			if (!entry) {
				entry = {
					code: flag.code,
					severity: flag.severity,
					kind: flag.kind,
					count: 0,
					drinks: 0,
					seen: new Set(),
				};
				byCode.set(flag.code, entry);
			}
			entry.count += 1;
			if (severityRank(flag.severity) > severityRank(entry.severity)) {
				entry.severity = flag.severity;
				entry.kind = flag.kind;
			}
			if (!entry.seen.has(id)) {
				entry.seen.add(id);
				entry.drinks += 1;
			}
		}
	}

	rows.sort(
		(a, b) =>
			b.critical - a.critical ||
			b.warning - a.warning ||
			a.name.localeCompare(b.name),
	);

	return {
		drinkCount,
		drinksWithCritical,
		drinksWithWarning,
		critical,
		warning,
		byCode: [...byCode.values()]
			.map(({ seen: _seen, ...rest }) => rest)
			.sort(
				(a, b) =>
					severityRank(b.severity) - severityRank(a.severity) ||
					b.drinks - a.drinks ||
					a.code.localeCompare(b.code),
			),
		items: rows,
	};
}

export type PeerRef = {
	name: string;
	volumeMl: number | null;
	specAbv: number | null;
	distance: number;
};

export type RecipeMetrics = {
	volumeMl: number | null;
	storedVolumeMl: number | null;
	storedVolumeMatches: boolean | null;
	alcoholMl: number | null;
	specAbv: number | null;
	ukUnits: number | null;
	kindMl: KindMl;
	spiritMl: number;
	citrusMl: number;
	sweetMl: number;
	liqueurMl: number;
	mixerMl: number;
	bitterMl: number;
	ratio: { spirit: number; citrus: number; sweet: number } | null;
	dilution: {
		method: DilutionMethod;
		fraction: number | null;
		confidence: "high" | "low";
	};
	inGlassMl: number | null;
	inGlassAbv: number | null;
	glassware: {
		name: string;
		capacityMl: number | null;
		fill: number | null;
	};
	flags: RecipeFlag[];
	vector: number[];
};

export type RecipeAnalysis = RecipeMetrics & {
	peers: {
		n: number;
		volumePercentile: number | null;
		abvPercentile: number | null;
		citrusVolumePercentile: number | null;
		nearest: PeerRef[];
	};
	price: RecipePriceAnalysis;
	issues: RecipeIssueSummary;
};

export type AnalyzeNote = {
	summary: string;
	concerns: string[];
	questions: string[];
};

const EMPTY_KIND_ML: KindMl = {
	liquor: 0,
	liqueur: 0,
	wine: 0,
	beer: 0,
	syrup: 0,
	juice: 0,
	bitter: 0,
	mixer: 0,
	garnish: 0,
	other: 0,
	unknown: 0,
};

const VECTOR_KINDS: KindMlKey[] = [
	"liquor",
	"liqueur",
	"syrup",
	"juice",
	"mixer",
	"bitter",
];

/** Typical brim-ish capacities. Estimates only. */
const GLASS_CAPACITY_ML: Record<string, number> = {
	coupe: 180,
	"nick & nora": 150,
	martini: 180,
	rocks: 300,
	highball: 350,
	collins: 350,
	flute: 180,
	wine: 350,
	mug: 300,
	julep: 350,
	hurricane: 440,
};

const DESC_STOP = new Set(["and", "with", "the", "a", "an", "of", "from"]);

/**
 * Guest-menu generics for bottles whose bar name is the brand.
 * Inventory `fullName` covers the rest (and any house bottles).
 */
const BRAND_IDENTITY: Record<string, string> = {
	"st-germain": "elderflower liqueur",
	italicus: "bergamot liqueur",
	borghetti: "coffee liqueur",
	disaronno: "amaretto",
};

export function roundMl(value: number): number {
	return Math.round(value * 10) / 10;
}

export function formatMl(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "";
	const rounded = roundMl(value);
	return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function parseVolumeMl(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
		return value;
	}
	if (typeof value !== "string") return null;
	const cleaned = value.replace(/ml/gi, "").replace(/,/g, "").trim();
	if (!cleaned) return null;
	const n = Number(cleaned);
	if (!Number.isFinite(n) || n < 0) return null;
	return n;
}

export function inventoryById(
	inventory: InventoryItem[] | null | undefined,
): Map<string, InventoryItem> {
	return inventoryIndex(inventory).byId;
}

type InventoryIndex = {
	byId: Map<string, InventoryItem>;
	byName: Map<string, InventoryItem>;
	bySlug: Map<string, InventoryItem>;
};

function inventoryIndex(
	inventory: InventoryItem[] | null | undefined,
): InventoryIndex {
	const byId = new Map<string, InventoryItem>();
	const byName = new Map<string, InventoryItem>();
	const bySlug = new Map<string, InventoryItem>();
	for (const item of inventory || []) {
		const id = String(item._id || item.id || "").trim();
		if (id) byId.set(id, item);
		const name = String(item.name || "").trim();
		if (name) byName.set(name.toLowerCase(), item);
		const slug = itemSlug(name);
		if (slug) bySlug.set(slug, item);
	}
	return { byId, byName, bySlug };
}

function stockForLine(
	ing: Ingredient,
	index: InventoryIndex,
): InventoryItem | undefined {
	const invId = ing.inventoryId != null ? String(ing.inventoryId).trim() : "";
	if (invId && index.byId.has(invId)) return index.byId.get(invId);
	const name = String(ing.name || "").trim();
	if (!name) return undefined;
	return index.byName.get(name.toLowerCase()) || index.bySlug.get(itemSlug(name));
}

function lineStockHref(
	ing: Ingredient,
	index: InventoryIndex,
): string | undefined {
	const invId = ing.inventoryId != null ? String(ing.inventoryId).trim() : "";
	if (!invId) return undefined;
	const stock = stockForLine(ing, index);
	const path = inventoryItemPath(String(stock?.name || ing.name || "").trim());
	return path.startsWith("/inventory/") ? path : undefined;
}

function emptyKindMl(): KindMl {
	return { ...EMPTY_KIND_ML };
}

function resolveKind(
	ing: Ingredient,
	index: InventoryIndex,
): KindMlKey {
	const stock = stockForLine(ing, index);
	const kind = stock?.kind;
	if (kind && (KIND_ML_KEYS as readonly string[]).includes(kind)) {
		return kind as KindMlKey;
	}
	const invId = ing.inventoryId != null ? String(ing.inventoryId).trim() : "";
	if (!invId && !stock) return "unknown";
	return stock ? "other" : "unknown";
}

function descriptionTokens(description: string): string[] {
	return description
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
}

function foldWord(word: string): string {
	const w = word.toLowerCase().replace(/[^a-z0-9]/g, "");
	if (w.length <= 3) return w;
	if (w.endsWith("ies") && w.length > 4) return `${w.slice(0, -3)}y`;
	if (/(?:ss|us|is|as)$/.test(w)) return w;
	if (w.endsWith("s")) return w.slice(0, -1);
	return w;
}

function wordsOf(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word.length > 2 && !DESC_STOP.has(word))
		.map(foldWord)
		.filter(Boolean);
}

function lineHaystack(ing: Ingredient, index: InventoryIndex): string {
	const stock = stockForLine(ing, index);
	const brand = BRAND_IDENTITY[itemSlug(stock?.name || ing.name || "")];
	return [ing.name, ing.note, stock?.name, stock?.fullName, brand]
		.map((part) => (typeof part === "string" ? part.trim() : ""))
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
}

function tokenMatchesRecipe(
	token: string,
	ingredients: Ingredient[],
	index: InventoryIndex,
): boolean {
	const needle = token.trim().toLowerCase();
	if (!needle) return true;
	const words = wordsOf(needle);
	return ingredients.some((ing) => {
		const hay = lineHaystack(ing, index);
		if (!hay) return false;
		if (hay.includes(needle) || needle.includes(hay)) return true;
		const hayWords = new Set(wordsOf(hay));
		return words.length > 0 && words.every((word) => hayWords.has(word));
	});
}

export function inferDilution(
	method: string | undefined,
	ice: string | undefined,
	drinkType?: DrinkType,
): RecipeMetrics["dilution"] {
	const type = normalizeDrinkType(drinkType);
	if (type === "pour" || type === "beer" || type === "packaged") {
		return { method: "none", fraction: 0, confidence: "high" };
	}
	const text = `${method || ""} ${ice || ""}`.toLowerCase();
	const iceNone = /^\s*none\s*$/i.test(String(ice || ""));
	if (iceNone && !String(method || "").trim()) {
		return { method: "none", fraction: 0, confidence: "low" };
	}
	if (/\b(shake|shaken|shaker)\b/.test(text)) {
		return { method: "shake", fraction: 0.25, confidence: "high" };
	}
	if (/\b(stir|stirred)\b/.test(text)) {
		return { method: "stir", fraction: 0.18, confidence: "high" };
	}
	if (/\b(build|built|highball|topped|top with)\b/.test(text)) {
		return { method: "built", fraction: 0.1, confidence: "high" };
	}
	if (/\b(blend|blended)\b/.test(text)) {
		return { method: "shake", fraction: 0.3, confidence: "high" };
	}
	if (iceNone || /\b(no ice|neat|straight up|up, no ice)\b/.test(text)) {
		return { method: "none", fraction: 0, confidence: "high" };
	}
	return { method: "unknown", fraction: null, confidence: "low" };
}

function glassCapacity(name: string | undefined): number | null {
	const key = String(name || "")
		.trim()
		.toLowerCase();
	if (!key) return null;
	return GLASS_CAPACITY_ML[key] ?? null;
}

function kindVector(kindMl: KindMl, volumeMl: number | null): number[] {
	const total = volumeMl && volumeMl > 0 ? volumeMl : 0;
	if (total <= 0) return VECTOR_KINDS.map(() => 0);
	return VECTOR_KINDS.map((key) => kindMl[key] / total);
}

function vectorDistance(a: number[], b: number[]): number {
	let sum = 0;
	const n = Math.max(a.length, b.length);
	for (let i = 0; i < n; i += 1) {
		const d = (a[i] || 0) - (b[i] || 0);
		sum += d * d;
	}
	return Math.sqrt(sum);
}

/** Share of samples strictly below `value` (0 = lowest, 100 = strictly highest). */
export function percentile(
	value: number | null,
	samples: Array<number | null | undefined>,
): number | null {
	if (value == null || !Number.isFinite(value)) return null;
	const nums = samples.filter(
		(n): n is number => typeof n === "number" && Number.isFinite(n),
	);
	if (nums.length === 0) return null;
	const below = nums.filter((n) => n < value).length;
	return Math.round((below / nums.length) * 100);
}

function sameItem(a: MenuItem, b: MenuItem): boolean {
	const idA = String(a._id || a.id || "").trim();
	const idB = String(b._id || b.id || "").trim();
	if (idA && idB) return idA === idB;
	const nameA = String(a.name || "")
		.trim()
		.toLowerCase();
	const nameB = String(b.name || "")
		.trim()
		.toLowerCase();
	return Boolean(nameA && nameA === nameB);
}

export function recipeMetrics(
	item: MenuItem | null | undefined,
	inventory: InventoryItem[] | null | undefined,
): RecipeMetrics {
	const ingredients = item?.ingredients || [];
	const index = inventoryIndex(inventory);
	const abvLookup = inventoryAbvById(inventory);
	const volumeMl = computeRecipeVolumeMl(ingredients);
	const specAbv = computeRecipeAbv(ingredients, abvLookup);
	const storedVolumeMl = parseVolumeMl(item?.volume);
	const storedVolumeMatches =
		volumeMl == null || storedVolumeMl == null
			? null
			: Math.abs(volumeMl - storedVolumeMl) < 0.15;

	const kindMl = emptyKindMl();
	let alcoholMl = 0;
	const missingAbv: { name: string; href?: string }[] = [];
	const unlinked: string[] = [];
	const skippedVolume: { name: string; href?: string }[] = [];

	for (const ing of ingredients) {
		const name = String(ing.name || "").trim() || "Unnamed";
		const invId = ing.inventoryId != null ? String(ing.inventoryId).trim() : "";
		const href = lineStockHref(ing, index);
		if (!invId && String(ing.name || "").trim()) unlinked.push(name);

		const ml = quantityToMl(ing.quantity, ing.unit);
		if (ml == null) {
			const unit = String(ing.unit || "").trim().toLowerCase();
			if (unit === "top") skippedVolume.push({ name, href });
			continue;
		}
		const kind = resolveKind(ing, index);
		kindMl[kind] = roundMl(kindMl[kind] + ml);
		const abvText = resolveIngredientAbv(ing, abvLookup);
		const abv = parseAbvPercent(abvText);
		alcoholMl += ml * ((abv ?? 0) / 100);
		if (abv == null && (kind === "liquor" || kind === "liqueur" || kind === "wine" || kind === "beer" || kind === "bitter" || kind === "unknown")) {
			missingAbv.push({ name, href });
		}
	}

	alcoholMl = roundMl(alcoholMl);
	const ukUnits =
		alcoholMl > 0 ? roundMl(alcoholMl / 10) : volumeMl == null ? null : 0;
	const spiritMl = roundMl(kindMl.liquor);
	const citrusMl = roundMl(kindMl.juice);
	const sweetMl = roundMl(kindMl.syrup);
	const ratio =
		spiritMl > 0 || citrusMl > 0 || sweetMl > 0
			? {
					spirit: roundMl(spiritMl),
					citrus: roundMl(citrusMl),
					sweet: roundMl(sweetMl),
				}
			: null;

	const mixed = hasRecipe(item?.drinkType);
	const dilution = inferDilution(item?.method, item?.ice, item?.drinkType);
	const inGlassMl =
		volumeMl == null
			? null
			: dilution.fraction == null
				? volumeMl
				: roundMl(volumeMl * (1 + dilution.fraction));
	const inGlassAbv =
		specAbv == null || volumeMl == null || volumeMl <= 0 || inGlassMl == null
			? null
			: (specAbv * volumeMl) / inGlassMl;

	const glassName = String(item?.glassware || "").trim();
	const capacityMl = glassCapacity(glassName);
	const fill =
		capacityMl && inGlassMl != null && capacityMl > 0
			? inGlassMl / capacityMl
			: null;

	const flags: RecipeFlag[] = [];
	if (
		mixed &&
		storedVolumeMatches === false &&
		volumeMl != null &&
		storedVolumeMl != null
	) {
		flags.push(
			makeFlag(
				"stored-volume-mismatch",
				"warning",
				"note",
				`Stored volume is ${formatMl(storedVolumeMl)} ml; the recipe sums to ${formatMl(volumeMl)} ml.`,
			),
		);
	}
	for (const row of missingAbv) {
		flags.push(
			makeFlag(
				`missing-abv:${row.name}`,
				"warning",
				"missing",
				`${row.name} has no ABV in stock; it is counted as 0%.`,
				row.href,
				row.href ? row.name : undefined,
			),
		);
	}
	for (const name of unlinked) {
		flags.push(
			makeFlag(
				`unlinked:${name}`,
				"warning",
				"missing",
				`${name} is not linked to stock, so its kind is unknown.`,
			),
		);
	}
	for (const row of skippedVolume) {
		flags.push(
			makeFlag(
				`top:${row.name}`,
				"note",
				"note",
				`${row.name} is a top, so it is not in the volume sum.`,
				row.href,
				row.href ? row.name : undefined,
			),
		);
	}

	const description = String(item?.description || "").trim();
	if (
		mixed &&
		description &&
		ingredients.some((ing) => String(ing.name || "").trim())
	) {
		for (const token of descriptionTokens(description)) {
			if (tokenMatchesRecipe(token, ingredients, index)) continue;
			flags.push(
				makeFlag(
					`description:${token.toLowerCase()}`,
					"critical",
					"note",
					`${token} is in the description but not on the recipe.`,
				),
			);
		}
	}

	if (mixed && dilution.method === "unknown") {
		flags.push(
			makeFlag(
				"method-unknown",
				"warning",
				"missing",
				"Method is missing. Set shake, stir, or built to estimate dilution. Until then volume is the spec only.",
			),
		);
	}

	if (fill != null && fill > 1.05) {
		flags.push(
			makeFlag(
				"glass-overflow",
				"critical",
				"note",
				`Diluted ${formatMl(inGlassMl)} ml may overflow a ${glassName} (~${formatMl(capacityMl)} ml).`,
			),
		);
	} else if (fill != null && fill < 0.4 && (inGlassMl || 0) > 0) {
		flags.push(
			makeFlag(
				"glass-short",
				"note",
				"note",
				`Diluted ${formatMl(inGlassMl)} ml is short for a ${glassName} (~${formatMl(capacityMl)} ml).`,
			),
		);
	}

	return {
		volumeMl,
		storedVolumeMl,
		storedVolumeMatches,
		alcoholMl: volumeMl == null ? null : alcoholMl,
		specAbv,
		ukUnits: volumeMl == null ? null : ukUnits,
		kindMl,
		spiritMl,
		citrusMl,
		sweetMl,
		liqueurMl: roundMl(kindMl.liqueur),
		mixerMl: roundMl(kindMl.mixer),
		bitterMl: roundMl(kindMl.bitter),
		ratio,
		dilution,
		inGlassMl,
		inGlassAbv,
		glassware: { name: glassName, capacityMl, fill },
		flags,
		vector: kindVector(kindMl, volumeMl),
	};
}

export function analyzeRecipe(
	item: MenuItem | null | undefined,
	inventory: InventoryItem[] | null | undefined,
	peers: MenuItem[] | null | undefined = [],
	targets?: PourTargetMap | null,
): RecipeAnalysis {
	const self = recipeMetrics(item, inventory);
	const peerRows = (peers || [])
		.filter((peer) => hasRecipe(peer.drinkType))
		.filter((peer) => (item ? !sameItem(peer, item) : true))
		.map((peer) => ({
			item: peer,
			metrics: recipeMetrics(peer, inventory),
		}))
		.filter((row) => row.metrics.volumeMl != null);

	const nearest = [...peerRows]
		.map((row) => ({
			name: String(row.item.name || "Untitled").trim() || "Untitled",
			volumeMl: row.metrics.volumeMl,
			specAbv: row.metrics.specAbv,
			distance: vectorDistance(self.vector, row.metrics.vector),
		}))
		.sort((a, b) => a.distance - b.distance)
		.slice(0, 6);

	const volumePercentile = percentile(
		self.volumeMl,
		peerRows.map((row) => row.metrics.volumeMl),
	);
	const abvPercentile = percentile(
		self.specAbv,
		peerRows.map((row) => row.metrics.specAbv),
	);
	const citrusPeers = peerRows.filter((row) => row.metrics.citrusMl > 0);
	const citrusVolumePercentile =
		self.citrusMl > 0
			? percentile(
					self.volumeMl,
					citrusPeers.map((row) => row.metrics.volumeMl),
				)
			: null;

	const price = recipePriceAnalysis(item, inventory, targets);
	const flags = [...self.flags];
	if (
		self.citrusMl > 0 &&
		citrusVolumePercentile != null &&
		citrusVolumePercentile <= 20 &&
		citrusPeers.length >= 3
	) {
		flags.push(
			makeFlag(
				"volume-low-vs-citrus",
				"warning",
				"note",
				`Spec is small for house drinks with juice (${citrusVolumePercentile}th percentile).`,
			),
		);
	}

	if (price.complete && price.drinkCost != null && price.actualPourCost != null) {
		const delta = price.actualPourCost - price.targetPourCost;
		if (delta >= 4) {
			flags.push(
				makeFlag(
					"pour-cost-high",
					"warning",
					"note",
					`Pour cost is ${formatPourPercent(price.actualPourCost)} against a ${formatPourPercent(price.targetPourCost)} target.`,
				),
			);
		} else if (delta <= -4) {
			flags.push(
				makeFlag(
					"pour-cost-low",
					"note",
					"note",
					`Pour cost is ${formatPourPercent(price.actualPourCost)}, below the ${formatPourPercent(price.targetPourCost)} target. The menu price is high relative to cost.`,
				),
			);
		}
	} else if (price.complete && price.drinkCost != null && price.actualPrice == null) {
		flags.push(
			makeFlag(
				"missing-menu-price",
				"warning",
				"missing",
				"No menu price, so pour cost cannot be compared to the target.",
			),
		);
	}
	if (price.hasEstimates) {
		const estimated = price.lines.filter((line) => line.estimated);
		const names = estimated.map((line) => line.name);
		const listed =
			names.length <= 3
				? names.join(", ")
				: `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
		const variable = estimated.find((line) => line.variable);
		let message =
			names.length === 1
				? `${names[0]} is an estimate. Set a trade price on Inventory to lock this.`
				: `${names.length} lines use estimated cost (${listed}). Set trade prices on Inventory to lock the pour cost.`;
		if (variable) {
			message =
				names.length === 1
					? `${names[0]} is an estimate. Fresh juice and produce move around. Set a trade price on Inventory when you can.`
					: `${message} ${variable.name} in particular moves with the fruit.`;
		}
		const estimatedHref =
			estimated.length === 1 && estimated[0].href
				? estimated[0].href
				: undefined;
		flags.push(
			makeFlag(
				"estimated-cost",
				"warning",
				"missing",
				message,
				estimatedHref,
				estimatedHref ? estimated[0].name : undefined,
			),
		);
	}
	if (price.missingLines > 0) {
		flags.push(
			makeFlag(
				"incomplete-cost",
				"warning",
				"missing",
				price.drinkCost != null
					? `Drink cost is partial. ${price.missingLines} line${price.missingLines === 1 ? "" : "s"} have no trade price or volume.`
					: "No trade prices on the recipe lines, so drink cost is unknown.",
			),
		);
	}

	return {
		...self,
		flags,
		issues: summarizeIssues(flags),
		peers: {
			n: peerRows.length,
			volumePercentile,
			abvPercentile,
			citrusVolumePercentile,
			nearest,
		},
		price,
	};
}

export function analysisPayload(analysis: RecipeAnalysis) {
	return {
		volumeMl: analysis.volumeMl,
		storedVolumeMl: analysis.storedVolumeMl,
		storedVolumeMatches: analysis.storedVolumeMatches,
		alcoholMl: analysis.alcoholMl,
		specAbv: analysis.specAbv,
		ukUnits: analysis.ukUnits,
		kindMl: analysis.kindMl,
		ratio: analysis.ratio,
		dilution: analysis.dilution,
		inGlassMl: analysis.inGlassMl,
		inGlassAbv: analysis.inGlassAbv,
		glassware: analysis.glassware,
		flags: analysis.flags,
		issues: analysis.issues,
		peers: analysis.peers,
		price: {
			drinkType: analysis.price.drinkType,
			targetPourCost: analysis.price.targetPourCost,
			pricedLines: analysis.price.pricedLines,
			estimatedLines: analysis.price.estimatedLines,
			variableLines: analysis.price.variableLines,
			missingLines: analysis.price.missingLines,
			complete: analysis.price.complete,
			hasEstimates: analysis.price.hasEstimates,
			drinkCost: analysis.price.drinkCost,
			actualPrice: analysis.price.actualPrice,
			actualPourCost: analysis.price.actualPourCost,
			targetPrice: analysis.price.targetPrice,
			suggestedPrice: analysis.price.suggestedPrice,
			variance: analysis.price.variance,
			margin: analysis.price.margin,
			serves: analysis.price.serves.map((serve) => ({
				key: serve.key,
				label: serve.label,
				costFactor: serve.costFactor,
				drinkCost: serve.drinkCost,
				price: serve.price,
				pourCost: serve.pourCost,
				targetPrice: serve.targetPrice,
				suggestedPrice: serve.suggestedPrice,
				variance: serve.variance,
				margin: serve.margin,
			})),
			lines: analysis.price.lines.slice(0, 16).map((line) => ({
				name: line.name,
				quantity: line.quantity,
				unit: line.unit,
				ml: line.ml,
				cost: line.cost,
				missing: line.missing,
				estimated: line.estimated,
				variable: line.variable,
				source: line.source,
				assumedSize: line.assumedSize,
			})),
		},
	};
}

export function recipeSnapshot(
	item: MenuItem,
	inventory?: InventoryItem[] | null,
) {
	const index = inventoryIndex(inventory);
	return {
		name: item.name || "",
		notes: item.notes || "",
		description: item.description || "",
		method: item.method || "",
		glassware: item.glassware || "",
		ice: item.ice || "",
		abv: item.abv || "",
		volume: item.volume || "",
		ingredients: (item.ingredients || []).map((ing) => {
			const stock = stockForLine(ing, index);
			return {
				quantity: ing.quantity ?? "",
				unit: ing.unit || "",
				name: ing.name || "",
				fullName:
					stock?.fullName ||
					BRAND_IDENTITY[itemSlug(stock?.name || ing.name || "")] ||
					"",
				note: ing.note || "",
				inventoryId: ing.inventoryId || "",
			};
		}),
	};
}

export function parseAnalyzeNote(raw: unknown): AnalyzeNote | null {
	const text =
		typeof raw === "string"
			? raw
			: raw && typeof raw === "object" && "response" in raw
				? String((raw as { response?: unknown }).response || "")
				: raw && typeof raw === "object"
					? JSON.stringify(raw)
					: "";
	const trimmed = text.trim();
	if (!trimmed) return null;

	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = (fenced ? fenced[1] : trimmed).trim();
	const start = candidate.indexOf("{");
	const end = candidate.lastIndexOf("}");
	if (start >= 0 && end > start) {
		try {
			const parsed = JSON.parse(candidate.slice(start, end + 1)) as {
				summary?: unknown;
				concerns?: unknown;
				questions?: unknown;
			};
			const summary =
				typeof parsed.summary === "string" ? parsed.summary.trim() : "";
			const concerns = Array.isArray(parsed.concerns)
				? parsed.concerns
						.filter((row): row is string => typeof row === "string")
						.map((row) => row.trim())
						.filter(Boolean)
				: [];
			const questions = Array.isArray(parsed.questions)
				? parsed.questions
						.filter((row): row is string => typeof row === "string")
						.map((row) => row.trim())
						.filter(Boolean)
				: [];
			if (summary || concerns.length || questions.length) {
				return { summary, concerns, questions };
			}
		} catch {
			/* fall through */
		}
	}
	return { summary: trimmed, concerns: [], questions: [] };
}
