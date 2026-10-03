/**
 * What stops a drink saving, by field id, so the editor can put each
 * message under its field and go to the first (switching tab if needed).
 */
import { namesClash } from "../app/spa-path.js";
import type { ErrorMap } from "../ui/form-errors.svelte";
import { numberError } from "../ui/number-input";

export type ItemValidateFields = {
	_id?: string;
	name?: string;
	price?: string;
	abv?: string;
	volume?: string;
};

/** Field ids in screen order: Build (name and price under Drink, then ABV and volume), then Menu. */
export const ITEM_FIELD_ORDER = ["f-name", "f-price", "f-abv", "f-volume", "f-pos-name"] as const;

export function itemFieldTab(key: string): string | undefined {
	if (key === "f-pos-name") return "menu";
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
	const changed = (key: "price" | "abv" | "volume") =>
		!saved || String(saved[key] || "") !== String(item[key] || "");
	const name = String(item.name || "").trim();
	if (!name) errors["f-name"] = "Add a name.";
	else if (others.some((row) => row._id !== item._id && namesClash(row.name, name))) {
		errors["f-name"] = "A drink with that name already exists.";
	}
	const price = changed("price") && numberError(item.price, { min: 0, noun: "an amount in pounds", example: "12.50" });
	if (price) errors["f-price"] = price;
	const abv = changed("abv") && numberError(stripUnit(item.abv, "%"), { min: 0, max: 100, noun: "a percentage" });
	if (abv) errors["f-abv"] = abv;
	const volume =
		changed("volume") && numberError(stripUnit(item.volume, "ml"), { min: 0, noun: "millilitres", example: "120" });
	if (volume) errors["f-volume"] = volume;
	return errors;
}
