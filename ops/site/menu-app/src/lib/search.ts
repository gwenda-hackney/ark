import {
	cocktailTypeLabel,
	drinkTypeLabel,
	flattenIngredientsForMenu,
	formatPrices,
	type MenuItem,
} from "./types.ts";

export type HighlightPart = { text: string; hit: boolean };

export type SearchField = {
	key: string;
	label: string;
	value: string;
	/** Already a grid column: highlight in place. */
	inGrid: boolean;
};

export type MatchHint = { label: string; text: string };

/** Split `text` so callers can wrap each hit in `<mark>`. */
export function highlightParts(text: string, query: string): HighlightPart[] {
	const raw = String(text ?? "");
	const needle = query.trim();
	if (!raw) return [];
	if (!needle) return [{ text: raw, hit: false }];

	const lower = raw.toLowerCase();
	const look = needle.toLowerCase();
	const parts: HighlightPart[] = [];
	let from = 0;
	while (from < raw.length) {
		const at = lower.indexOf(look, from);
		if (at < 0) {
			parts.push({ text: raw.slice(from), hit: false });
			break;
		}
		if (at > from) parts.push({ text: raw.slice(from, at), hit: false });
		parts.push({ text: raw.slice(at, at + look.length), hit: true });
		from = at + look.length;
		if (look.length === 0) break;
	}
	return parts;
}

/** Keep the match in view, with a little context on either side. */
export function snippetAround(
	text: string,
	query: string,
	radius = 32,
): string {
	const raw = String(text || "")
		.replace(/\s+/g, " ")
		.trim();
	const needle = query.trim();
	if (!raw || !needle) return raw;
	const i = raw.toLowerCase().indexOf(needle.toLowerCase());
	if (i < 0) return raw;
	const start = Math.max(0, i - radius);
	const end = Math.min(raw.length, i + needle.length + radius);
	return `${start > 0 ? "…" : ""}${raw.slice(start, end)}${end < raw.length ? "…" : ""}`;
}

function ingredientSearchText(item: MenuItem): string {
	const names = flattenIngredientsForMenu(item.ingredients);
	const notes = (item.ingredients || [])
		.map((ing) => (typeof ing.note === "string" ? ing.note.trim() : ""))
		.filter(Boolean)
		.join(", ");
	return [names, notes].filter(Boolean).join(" · ");
}

/** Fields the drinks grid searches. Visible columns highlight in place. */
export function recipeSearchFields(
	item: MenuItem,
	section: string,
): SearchField[] {
	return [
		{
			key: "name",
			label: "Name",
			value: String(item.name || ""),
			inGrid: true,
		},
		{
			key: "kind",
			label: "Kind",
			value: drinkTypeLabel(item.drinkType),
			inGrid: true,
		},
		{
			key: "price",
			label: "Price",
			value: formatPrices(item),
			inGrid: true,
		},
		{
			key: "abv",
			label: "ABV",
			value: String(item.abv || ""),
			inGrid: true,
		},
		{
			key: "volume",
			label: "Volume",
			value: String(item.volume || ""),
			inGrid: true,
		},
		{
			key: "notes",
			label: "Tasting note",
			value: String(item.notes || ""),
			inGrid: true,
		},
		{
			key: "category",
			label: "Category",
			value: cocktailTypeLabel(item.cocktailType),
			inGrid: true,
		},
		{
			key: "description",
			label: "Menu description",
			value: String(item.description || ""),
			inGrid: false,
		},
		{
			key: "ingredients",
			label: "Ingredients",
			value: ingredientSearchText(item),
			inGrid: false,
		},
		{
			key: "method",
			label: "Method",
			value: String(item.method || ""),
			inGrid: false,
		},
		{
			key: "garnish",
			label: "Garnish",
			value: String(item.garnish || ""),
			inGrid: false,
		},
		{
			key: "glassware",
			label: "Glass",
			value: String(item.glassware || ""),
			inGrid: false,
		},
		{
			key: "ice",
			label: "Ice",
			value: String(item.ice || ""),
			inGrid: false,
		},
		{
			key: "section",
			label: "Section",
			value: String(section || ""),
			inGrid: false,
		},
		{
			key: "producer",
			label: "Producer",
			value: String(item.producer || ""),
			inGrid: false,
		},
	];
}

export function fieldHits(fields: SearchField[], query: string): SearchField[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	return fields.filter((field) => field.value.toLowerCase().includes(q));
}

export function itemMatchesSearch(
	fields: SearchField[],
	query: string,
): boolean {
	if (!query.trim()) return true;
	return fieldHits(fields, query).length > 0;
}

/** First hit that is not already a grid column, for a snippet under the name. */
export function hiddenMatchHint(
	hits: SearchField[],
	query: string,
): MatchHint | null {
	const hidden = hits.find((hit) => !hit.inGrid && hit.value.trim());
	if (!hidden) return null;
	return {
		label: hidden.label,
		text: snippetAround(hidden.value, query),
	};
}
