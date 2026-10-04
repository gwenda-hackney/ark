/**
 * The ingredient picker's rules, kept out of the component so they can be
 * tested: find the stock first, then say how much.
 */
import type { InventoryItem } from "../inventory/types";
import type { Ingredient } from "./types";

/** Active stock with a name, A to Z. */
export function pickCatalog(inventory: InventoryItem[]): InventoryItem[] {
	return [...inventory]
		.filter((item) => item.active !== false && String(item.name || "").trim())
		.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

/**
 * Up to `limit` matches for what's typed: names that start with it first,
 * then names or full names that contain it.
 */
export function matchStock(catalog: InventoryItem[], query: string, limit = 10): InventoryItem[] {
	const needle = query.trim().toLowerCase();
	if (!needle) return catalog.slice(0, limit);
	const starts: InventoryItem[] = [];
	const contains: InventoryItem[] = [];
	for (const item of catalog) {
		const name = String(item.name || "").toLowerCase();
		const haystack = `${name} ${String(item.fullName || "").toLowerCase()}`;
		if (name.startsWith(needle)) starts.push(item);
		else if (haystack.includes(needle)) contains.push(item);
	}
	return [...starts, ...contains].slice(0, limit);
}

/** The stock whose name is exactly what's typed (any case). */
export function exactStock(catalog: InventoryItem[], query: string): InventoryItem | undefined {
	const needle = query.trim().toLowerCase();
	if (!needle) return undefined;
	return catalog.find((item) => String(item.name || "").trim().toLowerCase() === needle);
}

export function stockId(item: InventoryItem | null | undefined): string {
	return String(item?._id || item?.id || "");
}

/**
 * The unit once stock is picked: what was already chosen when the person
 * changed it, else the stock's own (a bottle of tonic is "each", not ml).
 */
export function unitForStock(item: InventoryItem, chosen: string, touched: boolean): string {
	if (touched && chosen.trim()) return chosen.trim();
	return String(item.defaultUnit || "").trim() || chosen.trim() || "ml";
}

/** The recipe line for picked stock. A quantity that isn't a number is left off. */
export function lineFromStock(item: InventoryItem, qty: string, unit: string): Ingredient {
	const raw = qty.trim();
	const parsed = raw ? Number(raw.replace(/,/g, "")) : NaN;
	const quantity = Number.isFinite(parsed) ? parsed : undefined;
	return {
		name: item.name,
		unit: unit.trim() || item.defaultUnit || "ml",
		inventoryId: stockId(item),
		...(quantity != null ? { quantity } : {}),
	};
}

/** "Add 50 ml Roku gin": the button says what goes in. */
export function addLabel(item: InventoryItem | null, qty: string, unit: string, mode: "add" | "edit"): string {
	const verb = mode === "edit" ? "Use" : "Add";
	if (!item) return mode === "edit" ? "Pick an ingredient" : "Pick an ingredient to add";
	const amount = qty.trim() ? `${qty.trim()}${unit.trim() ? ` ${unit.trim()}` : ""} ` : "";
	return `${verb} ${amount}${item.name}`;
}
