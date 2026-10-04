/**
 * Typed figures for NumberField and MoneyField. Values stay strings (the
 * forms and Baserow keep them as text); these read what was typed, tidy it
 * on blur and say what's wrong in words.
 */

/**
 * The number in what was typed, ignoring units and spaces: "£12.50" → 12.5,
 * "40 %" → 40, "1,5" → 1.5 (a decimal comma), "1,250" → 1250. "" for a blank
 * field, null when there is no number to read.
 */
export function parseNumber(raw: string | number | null | undefined): number | "" | null {
	if (raw == null) return "";
	if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
	let text = String(raw).trim();
	if (!text) return "";
	text = text.replace(/[£$€%\s]/g, "").replace(/(ml|cl|l|g|kg)$/i, "");
	if (!text) return null;
	// One comma and no dot, not followed by exactly three digits: a decimal comma.
	if (/^-?\d*,\d{1,2}$/.test(text)) text = text.replace(",", ".");
	else text = text.replace(/,(?=\d{3}(\D|$))/g, "");
	if (!/^-?(\d+\.?\d*|\.\d+)$/.test(text)) return null;
	const n = Number(text);
	return Number.isFinite(n) ? n : null;
}

/** Tidy for showing in the field: up to `decimals` places, no trailing zeros unless `fixed`. */
export function formatNumber(n: number, { decimals = 2, fixed = false } = {}): string {
	if (!Number.isFinite(n)) return "";
	const rounded = Number(n.toFixed(decimals));
	if (fixed) return rounded.toFixed(decimals);
	return String(rounded);
}

/** Money in the field: always two places ("12" → "12.00"). */
export function formatMoney(raw: string | number | null | undefined): string {
	const n = parseNumber(raw);
	if (n === "" || n === null) return typeof raw === "string" ? raw : "";
	return formatNumber(n, { decimals: 2, fixed: true });
}

export type NumberRules = {
	min?: number;
	max?: number;
	/** Whole numbers only. */
	integer?: boolean;
	/** What the field holds, for the message ("a percentage", "a price"). */
	noun?: string;
	/** Shown in the message: "like 12.50". */
	example?: string;
};

/** "" when the value is fine (blank counts as fine; required is the form's call). */
export function numberError(raw: string | number | null | undefined, rules: NumberRules = {}): string {
	const n = parseNumber(raw);
	if (n === "") return "";
	const noun = rules.noun || "a number";
	if (n === null) return `Enter ${noun}, like ${rules.example || (rules.integer ? "12" : "12.5")}.`;
	if (rules.integer && !Number.isInteger(n)) return "Use a whole number.";
	if (rules.min != null && rules.max != null && (n < rules.min || n > rules.max)) {
		return `Use a number from ${rules.min} to ${rules.max}.`;
	}
	if (rules.min != null && n < rules.min) return `Use ${rules.min} or more.`;
	if (rules.max != null && n > rules.max) return `Use ${rules.max} or less.`;
	return "";
}
