/**
 * Per-page list preferences: table or cards, comfortable or compact rows.
 * Kept in localStorage; private browsing can block it, so every read falls
 * back to the default and every write is allowed to fail.
 */

export type Density = "comfortable" | "compact";
export type ListView = "table" | "cards";

export const DENSITIES: readonly Density[] = ["comfortable", "compact"];
export const LIST_VIEWS: readonly ListView[] = ["table", "cards"];

/** Row heights in px. AG Grid needs numbers, not CSS variables. */
export const ROW_HEIGHT: Record<Density, number> = { comfortable: 40, compact: 32 };
export const HEADER_HEIGHT: Record<Density, number> = { comfortable: 36, compact: 32 };

type Store = Pick<Storage, "getItem" | "setItem">;

function defaultStore(): Store | null {
	try {
		return typeof localStorage === "undefined" ? null : localStorage;
	} catch {
		return null;
	}
}

export function densityKey(page: string): string {
	return `ops.density.${page}`;
}

/** Phones keep their own choice, so picking the table at a desk leaves cards on the phone. */
export function viewKey(page: string, phone = false): string {
	return phone ? `ops.view.${page}.phone` : `ops.view.${page}`;
}

/** The stored value when it is one of `allowed`, else `fallback`. */
export function readPref<T extends string>(
	key: string,
	allowed: readonly T[],
	fallback: T,
	store: Store | null = defaultStore(),
): T {
	try {
		const raw = store?.getItem(key);
		return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
	} catch {
		return fallback;
	}
}

export function writePref(key: string, value: string, store: Store | null = defaultStore()): void {
	try {
		store?.setItem(key, value);
	} catch {
		/* Storage blocked or full. The toggle still works for this visit. */
	}
}

export function readDensity(page: string, store?: Store | null): Density {
	return readPref(densityKey(page), DENSITIES, "comfortable", store);
}

/** Cards suit a phone; a desk has room for the table. */
export function readListView(page: string, phone: boolean, store?: Store | null): ListView {
	return readPref(viewKey(page, phone), LIST_VIEWS, phone ? "cards" : "table", store);
}

export function rowHeightFor(density: Density): number {
	return ROW_HEIGHT[density] ?? ROW_HEIGHT.comfortable;
}
