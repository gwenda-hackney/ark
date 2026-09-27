import { flattenMenuSections } from "../menu/menu-sections.js";
import { menuItemPath } from "../app/spa-path.js";
import type { MenuSection } from "../menu/types.ts";

export type InventoryUsage = {
	id: string;
	name: string;
	href: string;
};

/** Recipes whose spec links this inventory row. */
export function recipesUsingInventory(
	sections: MenuSection[] | null | undefined,
	inventoryId: string | number | null | undefined,
): InventoryUsage[] {
	const id = String(inventoryId ?? "").trim();
	if (!id || id === "new") return [];
	const seen = new Set<string>();
	const out: InventoryUsage[] = [];
	for (const section of flattenMenuSections(sections)) {
		for (const drink of section.items || []) {
			const drinkId = String(drink._id || drink.id || "");
			if (drinkId && seen.has(drinkId)) continue;
			const hit = (drink.ingredients || []).some(
				(ing) => String(ing.inventoryId || "").trim() === id,
			);
			if (!hit) continue;
			const name = String(drink.name || "").trim();
			if (!name) continue;
			if (drinkId) seen.add(drinkId);
			out.push({
				id: drinkId || name,
				name,
				href: menuItemPath(name),
			});
		}
	}
	out.sort((a, b) =>
		a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
	);
	return out;
}
