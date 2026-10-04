import type { MenuItem } from "./types";
import { mergeLegacyPrices, mirrorPrices } from "./prices.js";

/**
 * What the drink editor's Save sends. Placements go as they are: without them
 * the server rebuilds them from `sectionId`, which puts print and digital in
 * the same section and loses a different one set per channel (#151).
 */
export function menuItemPayload(item: MenuItem) {
	// The price table, with the two old price and SKU slots filled from its
	// first two rows. A caller that set only `price` still has it saved.
	const prices = mergeLegacyPrices(item);
	return {
		name: item.name,
		sectionId: item.sectionId,
		prices,
		...mirrorPrices(prices),
		drinkType: item.drinkType || "cocktail",
		cocktailType: item.cocktailType || "",
		notes: item.notes,
		glassware: item.glassware,
		ice: item.ice,
		garnish: item.garnish,
		onDigitalMenu: item.onDigitalMenu !== false,
		onPrintMenu: item.onPrintMenu !== false,
		posMenuIds: (item.posMenus || []).map((row) => row.id),
		lightspeedName: item.lightspeedName || "",
		lightspeedMenuScreen: item.lightspeedMenuScreen || "",
		description: item.description,
		method: item.method,
		abv: item.abv,
		volume: item.volume,
		// The editor settles both before Save; a flag left out is worked out on the server.
		...(typeof item.abvOverride === "boolean" ? { abvOverride: item.abvOverride } : {}),
		...(typeof item.volumeOverride === "boolean" ? { volumeOverride: item.volumeOverride } : {}),
		producer: item.producer,
		ingredients: item.ingredients || [],
		analysisNote: item.analysisNote ?? null,
		...(Array.isArray(item.placements) ? { placements: item.placements } : {}),
	};
}
