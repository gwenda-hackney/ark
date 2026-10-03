import type { MenuItem } from "./types";

/**
 * What the drink editor's Save sends. Placements go as they are: without them
 * the server rebuilds them from `sectionId`, which puts print and digital in
 * the same section and loses a different one set per channel (#151).
 */
export function menuItemPayload(item: MenuItem) {
	return {
		name: item.name,
		sectionId: item.sectionId,
		price: item.price,
		priceAlt: item.priceAlt,
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
		producer: item.producer,
		ingredients: item.ingredients || [],
		analysisNote: item.analysisNote ?? null,
		...(Array.isArray(item.placements) ? { placements: item.placements } : {}),
	};
}
