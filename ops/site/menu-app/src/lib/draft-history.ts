import { normalizeDrinkType, type Ingredient, type MenuItem } from "./types.ts";
import { parseStoredAnalyzeNote } from "../../../functions/_lib/analyze-note.js";

export const MAX_UNDO = 80;

export type MenuDraft = {
	name: string;
	sectionId: string;
	price: string;
	priceAlt: string;
	drinkType: ReturnType<typeof normalizeDrinkType>;
	notes: string;
	glassware: string;
	ice: string;
	garnish: string;
	onDigitalMenu: boolean;
	onPrintMenu: boolean;
		posMenuIds: string;
		lightspeedName: string;
		lightspeedMenuScreen: string;
	description: string;
	method: string;
	abv: string;
	volume: string;
	producer: string;
	ingredients: Ingredient[];
	analysisNote: ReturnType<typeof parseStoredAnalyzeNote>;
};

export type DraftHistory = {
	stack: string[];
	lastField: string;
};

export function emptyDraftHistory(): DraftHistory {
	return { stack: [], lastField: "" };
}

export function serializeMenuDraft(row: MenuItem | null): string {
	if (!row) return "";
	const draft: MenuDraft = {
		name: row.name || "",
		sectionId: row.sectionId || row.section?._ref || row.section?._id || "",
		price: row.price || "",
		priceAlt: row.priceAlt || "",
		drinkType: normalizeDrinkType(row.drinkType),
		notes: row.notes || "",
		glassware: row.glassware || "",
		ice: row.ice || "",
		garnish: row.garnish || "",
		onDigitalMenu: row.onDigitalMenu !== false,
		onPrintMenu: row.onPrintMenu !== false,
		posMenuIds: (row.posMenus || [])
			.map((menu) => String(menu.id))
			.sort()
			.join(","),
		lightspeedName: row.lightspeedName || "",
		lightspeedMenuScreen: row.lightspeedMenuScreen || "",
		description: row.description || "",
		method: row.method || "",
		abv: row.abv || "",
		volume: row.volume || "",
		producer: row.producer || "",
		ingredients: row.ingredients || [],
		analysisNote: parseStoredAnalyzeNote(row.analysisNote),
	};
	return JSON.stringify(draft);
}

export function parseMenuDraft(serialized: string): MenuDraft {
	return JSON.parse(serialized) as MenuDraft;
}

export function isDraftDirty(snapshot: string, current: string): boolean {
	return Boolean(snapshot && current && current !== snapshot);
}

export function canUndoDraft(history: DraftHistory, current: string): boolean {
	const last = history.stack[history.stack.length - 1];
	return Boolean(last && last !== current);
}

/** Push the pre-change snapshot. Consecutive edits to the same field coalesce. */
export function recordDraftChange(
	history: DraftHistory,
	field: string,
	serializedBefore: string,
	max = MAX_UNDO,
): DraftHistory {
	if (!serializedBefore) return history;
	if (field && field === history.lastField && history.stack.length) {
		return { stack: history.stack, lastField: field };
	}
	const last = history.stack[history.stack.length - 1];
	if (last === serializedBefore) {
		return { stack: history.stack, lastField: field };
	}
	const stack = [...history.stack, serializedBefore];
	return {
		stack: stack.length > max ? stack.slice(stack.length - max) : stack,
		lastField: field,
	};
}

export function undoDraft(history: DraftHistory): {
	history: DraftHistory;
	serialized: string | null;
} {
	if (!history.stack.length) {
		return { history, serialized: null };
	}
	return {
		history: {
			stack: history.stack.slice(0, -1),
			lastField: "",
		},
		serialized: history.stack[history.stack.length - 1] ?? null,
	};
}
