/**
 * Adding a placement to a drink: which kinds are still free (Print, Digital,
 * each POS menu once), and the row each one starts as.
 */
import type { MenuPlacement, PosMenu } from "./types";
import { parsePosScreenInput } from "../inventory/lightspeed-stock.js";

export type PlacementChoice = { value: string; label: string };

export function placementChoices(placements: MenuPlacement[], menus: PosMenu[]): PlacementChoice[] {
	const has = (channel: string) => placements.some((row) => row.channel === channel);
	const out: PlacementChoice[] = [];
	if (!has("print")) out.push({ value: "print", label: "Print" });
	if (!has("digital")) out.push({ value: "digital", label: "Digital" });
	for (const menu of menus) {
		const used = placements.some((row) => row.channel === "pos" && String(row.posMenuId) === String(menu.id));
		if (!used) out.push({ value: `pos:${menu.id}`, label: menu.isDefault ? `POS · ${menu.name} (default)` : `POS · ${menu.name}` });
	}
	return out;
}

/** The placements with `value` added, or unchanged when it can't be. */
export function addPlacement(
	placements: MenuPlacement[],
	value: string,
	menus: PosMenu[],
	defaults: { sectionId: string; screen: string },
): MenuPlacement[] {
	if (value === "print" || value === "digital") {
		if (!defaults.sectionId) return placements;
		return [...placements.filter((row) => row.channel !== value), { channel: value, sectionId: defaults.sectionId }];
	}
	if (value.startsWith("pos:")) {
		const menu = menus.find((row) => String(row.id) === value.slice(4));
		if (!menu) return placements;
		return [
			...placements,
			{ channel: "pos", posMenuId: String(menu.id), posMenuName: menu.name, posScreen: defaults.screen },
		];
	}
	return placements;
}

/** A new POS row's screen: the one this drink already uses, else the first known, else Signature Cocktails. */
export function defaultPosScreen(placements: MenuPlacement[], suggestions: string[]): string {
	const existing = placements.find((row) => row.channel === "pos");
	return parsePosScreenInput(existing?.posScreen) || parsePosScreenInput(suggestions[0]) || "Signature Cocktails";
}
