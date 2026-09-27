import type { Ingredient } from "../app/types.ts";

/** Approximate ml for volume-bearing recipe units. Non-volume units return null. */
export function quantityToMl(
	quantity: unknown,
	unit: unknown,
): number | null {
	const q =
		typeof quantity === "number"
			? quantity
			: typeof quantity === "string"
				? Number(String(quantity).replace(/,/g, "").trim())
				: NaN;
	if (!Number.isFinite(q) || q <= 0) return null;

	switch (typeof unit === "string" ? unit.trim().toLowerCase() : "") {
		case "ml":
			return q;
		case "cl":
			return q * 10;
		case "dash":
			return q * 0.9;
		case "barspoon":
			return q * 5;
		case "tsp":
			return q * 5;
		case "tbsp":
			return q * 15;
		case "drop":
			return q * 0.05;
		case "splash":
			return q * 3.5;
		default:
			return null;
	}
}

/** Parse "40", "40%", "12.5" as ABV percent. */
export function parseAbvPercent(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
		return value;
	}
	if (typeof value !== "string") return null;
	const cleaned = value.replace(/%/g, "").trim();
	if (!cleaned) return null;
	const n = Number(cleaned);
	if (!Number.isFinite(n) || n < 0) return null;
	return n;
}

export function formatAbv(percent: number): string {
	const rounded = Math.round(percent * 10) / 10;
	const text = Number.isInteger(rounded)
		? String(rounded)
		: rounded.toFixed(1);
	return `${text}%`;
}

export function formatVolumeMl(ml: number): string {
	const rounded = Math.round(ml * 10) / 10;
	const text = Number.isInteger(rounded)
		? String(rounded)
		: rounded.toFixed(1);
	return `${text} ml`;
}

export type InventoryAbvLookup = Map<string, string | undefined> | null | undefined;

/** Build id → ABV lookup from inventory catalog rows. */
export function inventoryAbvById(
	inventory:
		| { _id?: string; id?: string; abv?: string }[]
		| null
		| undefined,
): Map<string, string | undefined> {
	const map = new Map<string, string | undefined>();
	for (const item of inventory || []) {
		const id = String(item._id || item.id || "").trim();
		if (!id) continue;
		const abv = typeof item.abv === "string" ? item.abv.trim() : "";
		map.set(id, abv || undefined);
	}
	return map;
}

/**
 * Linked lines use inventory ABV only (never the denormalized line copy).
 * Unlinked lines may carry a local ABV override.
 */
export function resolveIngredientAbv(
	ing: Pick<Ingredient, "abv" | "inventoryId"> | null | undefined,
	inventoryById: InventoryAbvLookup,
): string | undefined {
	const invId =
		ing?.inventoryId != null ? String(ing.inventoryId).trim() : "";
	if (invId) {
		if (!inventoryById) return undefined;
		const fromInv = inventoryById.get(invId);
		return fromInv && String(fromInv).trim()
			? String(fromInv).trim()
			: undefined;
	}
	const line = typeof ing?.abv === "string" ? ing.abv.trim() : "";
	return line || undefined;
}

/**
 * Volume-weighted ABV from ingredients.
 * Lines without a convertible volume are skipped.
 * Missing resolved ABV counts as 0% (dilution).
 */
export function computeRecipeAbv(
	ingredients: Ingredient[] | undefined | null,
	inventoryById?: InventoryAbvLookup,
): number | null {
	let alcoholMl = 0;
	let totalMl = 0;
	for (const ing of ingredients || []) {
		const ml = quantityToMl(ing.quantity, ing.unit);
		if (ml == null) continue;
		totalMl += ml;
		const abv = resolveIngredientAbv(ing, inventoryById);
		alcoholMl += ml * ((parseAbvPercent(abv) ?? 0) / 100);
	}
	if (totalMl <= 0) return null;
	return (alcoholMl / totalMl) * 100;
}

export function computeRecipeVolumeMl(
	ingredients: Ingredient[] | undefined | null,
): number | null {
	let totalMl = 0;
	let any = false;
	for (const ing of ingredients || []) {
		const ml = quantityToMl(ing.quantity, ing.unit);
		if (ml == null) continue;
		any = true;
		totalMl += ml;
	}
	if (!any) return null;
	return Math.round(totalMl * 10) / 10;
}
