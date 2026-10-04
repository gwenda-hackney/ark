/**
 * Adding a placement to a drink: every kind (Print, Digital, each POS menu) is
 * always on offer, as often as wanted, and the row each one starts as.
 */
import type { MenuPlacement, PosMenu } from "./types";
import { parsePosScreenInput } from "../inventory/lightspeed-stock.js";

export type PlacementChoice = { value: string; label: string };

/** Every kind of placement. A drink can sit in two Print chapters, or on two screens of one POS menu. */
export function placementChoices(menus: PosMenu[]): PlacementChoice[] {
	return [
		{ value: "print", label: "Print" },
		{ value: "digital", label: "Digital" },
		...menus.map((menu) => ({
			value: `pos:${menu.id}`,
			label: menu.isDefault ? `POS · ${menu.name} (default)` : `POS · ${menu.name}`,
		})),
	];
}

/**
 * The placements with a `value` row added at the end, or unchanged when it can't be.
 * The row starts in the default chapter or screen; when the drink already sits
 * there on that channel or POS menu, it takes the first of `sectionIds` or
 * `screens` still free, so a second row doesn't start as a repeat.
 */
export function addPlacement(
	placements: MenuPlacement[],
	value: string,
	menus: PosMenu[],
	defaults: { sectionId: string; screen: string; sectionIds?: string[]; screens?: string[] },
): MenuPlacement[] {
	if (value === "print" || value === "digital") {
		if (!defaults.sectionId) return placements;
		const taken = new Set(
			placements.filter((row) => row.channel === value).map((row) => String(row.sectionId || "")),
		);
		const sectionId = firstFree(defaults.sectionId, defaults.sectionIds, (id) => taken.has(id));
		return [...placements, { channel: value, sectionId }];
	}
	if (value.startsWith("pos:")) {
		const menu = menus.find((row) => String(row.id) === value.slice(4));
		if (!menu) return placements;
		const taken = new Set(
			placements
				.filter((row) => row.channel === "pos" && String(row.posMenuId) === String(menu.id))
				.map((row) => parsePosScreenInput(row.posScreen).toLowerCase()),
		);
		const posScreen = firstFree(defaults.screen, defaults.screens, (path) =>
			taken.has(parsePosScreenInput(path).toLowerCase()),
		);
		return [...placements, { channel: "pos", posMenuId: String(menu.id), posMenuName: menu.name, posScreen }];
	}
	return placements;
}

function firstFree(preferred: string, others: string[] | undefined, taken: (value: string) => boolean): string {
	if (!taken(preferred)) return preferred;
	return (others || []).find((value) => value && !taken(value)) || preferred;
}

/**
 * True when a row above has the same channel and chapter, or the same POS menu
 * and screen. Save keeps only one of them, so the table flags the repeat.
 */
export function isRepeatPlacement(placements: MenuPlacement[], index: number): boolean {
	const key = placementRowKey(placements[index]);
	return Boolean(key) && placements.slice(0, index).some((row) => placementRowKey(row) === key);
}

function placementRowKey(row: MenuPlacement | undefined): string {
	if (!row) return "";
	if (row.channel === "pos") {
		return `pos:${String(row.posMenuId || "")}:${parsePosScreenInput(row.posScreen).toLowerCase()}`;
	}
	return `${row.channel}:${String(row.sectionId || "")}`;
}

/** A new POS row's screen: the one this drink already uses, else the first known, else Signature Cocktails. */
export function defaultPosScreen(placements: MenuPlacement[], suggestions: string[]): string {
	const existing = placements.find((row) => row.channel === "pos");
	return parsePosScreenInput(existing?.posScreen) || parsePosScreenInput(suggestions[0]) || "Signature Cocktails";
}
