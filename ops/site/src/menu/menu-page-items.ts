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

/** Names as a person says them: "A", "A and B", "A, B and 3 more". */
export function nameList(names: string[], most = 3): string {
	if (names.length <= 1) return names[0] || "";
	if (names.length <= most) return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
	const rest = names.length - (most - 1);
	return `${names.slice(0, most - 1).join(", ")} and ${rest} more`;
}

/**
 * What Remove section says before it asks, from what the server says it
 * takes (api.previewSectionRemoval). Null when the section is empty: it
 * goes without asking.
 */
export function sectionRemovalQuestion(
	removal: { title: string; groups: string[]; deleted: string[]; takenOff: string[] },
	menuName: string,
): { title: string; message: string; action: string } | null {
	const { groups, deleted, takenOff } = removal;
	if (!groups.length && !deleted.length && !takenOff.length) return null;
	const lines: string[] = [];
	if (groups.length) lines.push(`${nameList(groups)} ${groups.length === 1 ? "goes" : "go"} with it.`);
	if (deleted.length) {
		lines.push(
			`${nameList(deleted)} ${deleted.length === 1 ? "isn't" : "aren't"} on any other menu, so ${deleted.length === 1 ? "it's" : "they're"} deleted, with ${deleted.length === 1 ? "its recipe" : "their recipes"}.`,
		);
	}
	if (takenOff.length) lines.push(`${nameList(takenOff)} ${takenOff.length === 1 ? "stays on its" : "stay on their"} other menus.`);
	if (deleted.length) lines.push("This can't be undone.");
	return {
		title: `Remove ${removal.title} from ${menuName}?`,
		message: lines.join(" "),
		action: deleted.length ? "Remove and delete" : "Remove",
	};
}
