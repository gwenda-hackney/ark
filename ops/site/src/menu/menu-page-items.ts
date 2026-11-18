/**
 * What the menu's page (#305) does to an item: change its name, line and
 * price there, or take it off the menu. Both start from the item as its
 * editor has it (api.getItem) and save it the same way (menuItemPayload), so
 * nothing else about it changes.
 */
import { offMenu as offMenuRule } from "./off-menu.js";
import type { MenuItem } from "./types";

export type QuickEdit = { name: string; description: string; price: string };

/** A price as typed: "£12.50" and "12.5" are both 12.50; "" is none. */
export function cleanPrice(value: string): string {
	const raw = String(value || "").replace(/[£,\s]/g, "");
	if (!raw) return "";
	const number = Number(raw);
	if (!Number.isFinite(number) || number < 0) return "";
	return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

/** The item with its name, line and first price set; other sizes stay. */
export function withQuickEdit(item: MenuItem, edit: QuickEdit): MenuItem {
	const price = cleanPrice(edit.price);
	const rows = Array.isArray(item.prices) ? item.prices.map((row) => ({ ...row })) : [];
	if (rows.length) rows[0] = { ...rows[0], price };
	else if (price) rows.push({ name: "", price });
	return {
		...item,
		name: edit.name.trim(),
		description: edit.description.trim() || undefined,
		// The old slot wins over the first row when both are sent (prices.js).
		price: price || undefined,
		prices: rows,
	};
}

/**
 * Taking an item off this menu (its sections `here`): its print and website
 * places on it go, the rest stay. `delete` when that leaves it on no menu at
 * all. The rule is shared with the server (off-menu.js).
 */
export function offMenu(item: MenuItem, here: Iterable<string>): { action: "delete" } | { action: "update"; item: MenuItem } {
	return offMenuRule(item, here);
}
