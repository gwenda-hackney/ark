/**
 * Save menu on a menu's page: each step of the draft's plan
 * (menu-page-draft.svelte.ts) through the ops API, the same calls the page
 * made one at a time before. An item is changed or taken off from itself as
 * its editor has it (api.getItem), so nothing else about it changes.
 */
import * as api from "../app/api";
import { menuItemPayload } from "./item-payload";
import type { SavePort } from "./menu-page-draft.svelte";
import { offMenu, withQuickEdit } from "./menu-page-items";

export function apiSavePort(menuId: string): SavePort {
	return {
		async details(body) {
			await api.updateMenu(menuId, body);
		},
		async createSection({ title, subtitle, parentId, menuId: on }) {
			const body = parentId ? { title, subtitle, parentId } : { title, subtitle, parentId: "", menuId: on };
			const { section } = await api.createSection(body);
			return String(section._id);
		},
		async updateSection(id, body) {
			await api.updateSection(id, body);
		},
		async updateItem(id, edit) {
			const { item } = await api.getItem(id);
			await api.updateItem(id, menuItemPayload(withQuickEdit(item, edit)));
		},
		async createItem(sectionId, edit) {
			const { item } = await api.createItem({
				name: edit.name,
				description: edit.description || undefined,
				sectionId,
				...(edit.price ? { price: edit.price, prices: [{ name: "", price: edit.price }] } : {}),
			});
			return String(item._id ?? item.id);
		},
		async order(ids) {
			await api.orderSections(ids);
		},
		async takeOff(id, here) {
			const { item } = await api.getItem(id);
			const plan = offMenu(item, here);
			if (plan.action === "delete") await api.deleteItem(id);
			else await api.updateItem(id, menuItemPayload(plan.item));
		},
		async removeSection(id) {
			await api.removeSection(id);
		},
	};
}
