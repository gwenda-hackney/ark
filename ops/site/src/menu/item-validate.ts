/**
 * What stops a drink saving, by field id, so the editor can put each
 * message under its field and go to the first (switching tab if needed).
 */
import { namesClash } from "../app/spa-path.js";
import type { ErrorMap } from "../ui/form-errors.svelte";
import { numberError } from "../ui/number-input";
import { normalizePrices, type PriceRow } from "./prices.js";

export type ItemValidateFields = {
	_id?: string;
	name?: string;
	drinkType?: string;
	price?: string;
	priceAlt?: string;
	prices?: PriceRow[];
	abv?: string;
	volume?: string;
};

/** Price rows the field order lists; a longer table still works, its later rows just come last. */
const ORDERED_PRICE_ROWS = 24;

/** Price row ids: `f-price-name-1` for the second row's name, `f-price-1` for its amount. */
export function priceFieldId(field: "name" | "price" | "size" | "sku", index: number): string {
	return field === "price" ? `f-price-${index}` : `f-price-${field}-${index}`;
}

/**
 * Field ids in screen order: Build (name), then Menu (ABV, volume, till
 * name), then Pricing (each row's name, then its amount).
 */
export const ITEM_FIELD_ORDER: readonly string[] = [
	"f-name",
	"f-abv",
	"f-volume",
	"f-pos-name",
	...Array.from({ length: ORDERED_PRICE_ROWS }, (_, i) => [priceFieldId("name", i), priceFieldId("price", i)]).flat(),
];

export function itemFieldTab(key: string): string | undefined {
	if (key === "f-abv" || key === "f-volume" || key === "f-pos-name") return "menu";
	if (key.startsWith("f-price")) return "cost";
	return "details";
}

/** "12.5%" → "12.5", "120 ml" → "120": the figure the field shows beside its unit. */
export function stripUnit(stored: string | undefined, unit: "%" | "ml"): string {
	const text = String(stored || "").trim();
	return unit === "%" ? text.replace(/\s*%\s*$/, "") : text.replace(/\s*ml\s*$/i, "");
}

/**
 * `saved` is the drink as last saved: a figure that hasn't changed since is
 * left alone, so an old odd value ("125/175 ml") never blocks another edit.
 */
export function validateItem(
	item: ItemValidateFields,
	others: { _id?: string; name?: string }[] = [],
	saved: ItemValidateFields | null = null,
): ErrorMap {
	const errors: ErrorMap = {};
	const changed = (key: "abv" | "volume") => !saved || String(saved[key] || "") !== String(item[key] || "");
	const name = String(item.name || "").trim();
	if (!name) errors["f-name"] = "Add a name.";
	else if (others.some((row) => row._id !== item._id && namesClash(row.name, name))) {
		errors["f-name"] = "A drink with that name already exists.";
	}
	Object.assign(errors, validatePrices(normalizePrices(item), saved ? normalizePrices(saved) : null));
	const abv = changed("abv") && numberError(stripUnit(item.abv, "%"), { min: 0, max: 100, noun: "a percentage" });
	if (abv) errors["f-abv"] = abv;
	const volume =
		changed("volume") && numberError(stripUnit(item.volume, "ml"), { min: 0, noun: "millilitres", example: "120" });
	if (volume) errors["f-volume"] = volume;
	return errors;
}

/**
 * Every row needs a name no other row has, and an amount. A blank amount is
 * always caught (every drink on the menu has a price); an odd one only once
 * it has changed since the last save.
 */
export function validatePrices(rows: PriceRow[], saved: PriceRow[] | null = null): ErrorMap {
	const errors: ErrorMap = {};
	const seen = new Set<string>();
	rows.forEach((row, index) => {
		const name = String(row.name || "").trim();
		const key = name.toLowerCase();
		if (!name) errors[priceFieldId("name", index)] = "Add a name.";
		else if (seen.has(key)) errors[priceFieldId("name", index)] = "Another price has this name.";
		seen.add(key);
		const amount = String(row.price || "").trim();
		const changed = !saved || String(saved[index]?.price || "") !== amount;
		const problem = !amount
			? "Add a price."
			: changed && numberError(amount, { min: 0, noun: "an amount in pounds", example: index === 0 ? "12.50" : "16" });
		if (problem) errors[priceFieldId("price", index)] = problem;
	});
	return errors;
}
