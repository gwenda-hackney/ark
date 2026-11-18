/**
 * A menu's page (#305) as a draft: nothing is written until Save menu.
 * The page shows the draft, so every change is there at once, marked:
 * edited, new, or to come off. Save menu writes it in order (`plan`):
 * the menu's details, new sections (so new items can go in them), section
 * changes, items, the order, then what comes off. A step that fails stops
 * the save; what was written is kept and the rest stays in the draft
 * (`settle`).
 */
import { blankMenu, sameMenu, menuPayload } from "./menu-form";
import { cleanPrice, nameList } from "./menu-page-items";
import { normalizePrices } from "./prices.js";
import type { MenuInput, MenuItemChapter, MenuPageItem, PriceRow } from "./types";

export type QuickEdit = { name: string; description: string; price: string };

/** How an item differs from what's saved. */
export type ItemMark = "" | "edited" | "new" | "off";
/** How a section differs from what's saved. */
export type SectionMark = "" | "edited" | "new" | "removed" | "moved";

export type DraftItem = MenuPageItem & { mark: ItemMark };
export type DraftBlock = {
	sectionId: string;
	title: string;
	subtitle: string;
	items: DraftItem[];
	mark: SectionMark;
	/** The menu a moved chapter goes to. */
	movedTo: string;
};
export type DraftChapter = DraftBlock & { groups: DraftBlock[] };

type NewSection = { id: string; parentId: string; title: string; subtitle: string };
type NewItem = QuickEdit & { id: string; sectionId: string };
type SectionEdit = { title?: string; subtitle?: string };

export type SaveStep =
	| { kind: "details"; label: string; body: MenuInput }
	| { kind: "createSection"; label: string; id: string; parentId: string; title: string; subtitle: string }
	| { kind: "updateSection"; label: string; id: string; body: { title?: string; subtitle?: string; menuId?: string } }
	| { kind: "updateItem"; label: string; id: string; edit: QuickEdit }
	| { kind: "createItem"; label: string; id: string; sectionId: string; edit: QuickEdit }
	| { kind: "order"; label: string; parent: string; ids: string[] }
	| { kind: "takeOff"; label: string; id: string }
	| { kind: "removeSection"; label: string; id: string };

/** How Save menu writes each step: the page hands in the API (menu-page-save.ts). */
export type SavePort = {
	details(body: MenuInput): Promise<void>;
	/** The new section's id. */
	createSection(body: { title: string; subtitle: string; parentId: string; menuId: string }): Promise<string>;
	updateSection(id: string, body: { title?: string; subtitle?: string; menuId?: string }): Promise<void>;
	updateItem(id: string, edit: QuickEdit): Promise<void>;
	/** The new item's id. */
	createItem(sectionId: string, edit: QuickEdit): Promise<string>;
	order(ids: string[]): Promise<void>;
	/** Off this menu (its sections `here`): deleted when it's on no other. */
	takeOff(id: string, here: string[]): Promise<void>;
	removeSection(id: string): Promise<void>;
};

export type SaveResult = {
	done: SaveStep[];
	failed: { step: SaveStep; message: string } | null;
	/** Steps not tried after a failure. */
	rest: SaveStep[];
	/** New sections' and items' draft ids → their saved ids. */
	ids: Record<string, string>;
};

const NEW_SECTION = "new-section-";
const NEW_ITEM = "new-item-";

function firstPrice(prices: PriceRow[]): string {
	return normalizePrices({ prices })[0]?.price || "";
}

/** The item as the page's editor sees it: name, line and first price. */
export function quickOf(item: Pick<MenuPageItem, "name" | "description" | "prices">): QuickEdit {
	return { name: item.name, description: item.description || "", price: firstPrice(item.prices) };
}

function sameQuick(a: QuickEdit, b: QuickEdit): boolean {
	return a.name.trim() === b.name.trim() && a.description.trim() === b.description.trim() && cleanPrice(a.price) === cleanPrice(b.price);
}

function cleanQuick(edit: QuickEdit): QuickEdit {
	return { name: edit.name.trim(), description: edit.description.trim(), price: cleanPrice(edit.price) };
}

/** Its prices with the first one set to `price`, as Save will write them (withQuickEdit). */
function withPrice(prices: PriceRow[], price: string): PriceRow[] {
	const rows = prices.map((row) => ({ ...row }));
	if (rows.length) rows[0] = { ...rows[0], price };
	else if (price) rows.push({ name: "", price } as PriceRow);
	return rows;
}

const without = <T>(list: T[], value: T) => list.filter((entry) => entry !== value);
function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
	const { [key]: _, ...rest } = record;
	return rest;
}

export class MenuPageDraft {
	menuId = $state("");
	/** Other menus by id, for "Moves to …". */
	menuNames = $state<Record<string, string>>({});
	/** The menu's details as saved, and as the form has them. */
	savedDetails = $state<MenuInput>(blankMenu());
	details = $state<MenuInput>(blankMenu());
	/** The sections and items as saved. */
	saved = $state<MenuItemChapter[]>([]);

	sectionEdits = $state<Record<string, SectionEdit>>({});
	newSections = $state<NewSection[]>([]);
	removed = $state<string[]>([]);
	/** Chapters to move: id → the other menu's id. */
	moved = $state<Record<string, string>>({});
	/** Siblings' order where it was changed: parent ("" for chapters) → ids. */
	order = $state<Record<string, string[]>>({});
	itemEdits = $state<Record<string, QuickEdit>>({});
	newItems = $state<NewItem[]>([]);
	takenOff = $state<string[]>([]);
	#next = 0;

	detailsDirty = $derived(!sameMenu(this.details, this.savedDetails));
	itemsDirty = $derived(
		Object.keys(this.sectionEdits).length > 0 ||
			this.newSections.length > 0 ||
			this.removed.length > 0 ||
			Object.keys(this.moved).length > 0 ||
			Object.keys(this.order).length > 0 ||
			Object.keys(this.itemEdits).length > 0 ||
			this.newItems.length > 0 ||
			this.takenOff.length > 0,
	);
	dirty = $derived(this.detailsDirty || this.itemsDirty);

	/** Start from the menu as saved, dropping every change. */
	load(menuId: string, details: MenuInput, chapters: MenuItemChapter[], menuNames: Record<string, string> = {}) {
		this.menuId = menuId;
		this.menuNames = menuNames;
		this.savedDetails = { ...details, days: [...details.days] };
		this.details = { ...details, days: [...details.days] };
		this.saved = chapters;
		this.sectionEdits = {};
		this.newSections = [];
		this.removed = [];
		this.moved = {};
		this.order = {};
		this.itemEdits = {};
		this.newItems = [];
		this.takenOff = [];
	}

	// What's saved, looked up.

	#savedBlocks() {
		return this.saved.flatMap((chapter) => [
			{ block: chapter, parentId: "" },
			...chapter.groups.map((group) => ({ block: group, parentId: chapter.sectionId })),
		]);
	}

	#savedBlock(id: string) {
		return this.#savedBlocks().find((entry) => entry.block.sectionId === id) || null;
	}

	#savedItem(id: string): MenuPageItem | null {
		for (const { block } of this.#savedBlocks()) {
			const item = block.items.find((entry) => entry.id === id);
			if (item) return item;
		}
		return null;
	}

	#parentOf(id: string): string {
		return this.#savedBlock(id)?.parentId ?? this.newSections.find((section) => section.id === id)?.parentId ?? "";
	}

	#exists(id: string): boolean {
		return Boolean(this.#savedBlock(id)) || this.newSections.some((section) => section.id === id);
	}

	isNewSection(id: string): boolean {
		return id.startsWith(NEW_SECTION);
	}

	isNewItem(id: string): boolean {
		return id.startsWith(NEW_ITEM);
	}

	/** Off with its section: the section, or its chapter, is to be removed. */
	#gone(id: string): boolean {
		return this.removed.includes(id) || this.removed.includes(this.#parentOf(id));
	}

	/** The saved siblings, then new ones, in the order they were added. */
	#natural(parent: string): string[] {
		const saved = parent ? this.saved.find((chapter) => chapter.sectionId === parent)?.groups || [] : this.saved;
		return [...saved.map((block) => block.sectionId), ...this.newSections.filter((section) => section.parentId === parent).map((section) => section.id)];
	}

	/** Siblings as the page shows them. */
	arranged(parent: string): string[] {
		const natural = this.#natural(parent);
		const wanted = this.order[parent];
		if (!wanted) return natural;
		const kept = wanted.filter((id) => natural.includes(id));
		return [...kept, ...natural.filter((id) => !kept.includes(id))];
	}

	// The page, as it will be.

	#itemView(item: MenuPageItem): DraftItem {
		const edit = this.itemEdits[item.id];
		const shown = edit
			? { ...item, name: edit.name.trim(), description: edit.description.trim(), prices: withPrice(item.prices, cleanPrice(edit.price)) }
			: item;
		return { ...shown, mark: this.takenOff.includes(item.id) ? "off" : edit ? "edited" : "" };
	}

	#blockView(id: string): DraftBlock {
		const saved = this.#savedBlock(id)?.block;
		const fresh = this.newSections.find((section) => section.id === id);
		const edit = this.sectionEdits[id] || {};
		const mark: SectionMark = fresh
			? "new"
			: this.removed.includes(id)
				? "removed"
				: this.moved[id]
					? "moved"
					: this.sectionEdits[id]
						? "edited"
						: "";
		return {
			sectionId: id,
			title: edit.title ?? saved?.title ?? fresh?.title ?? "",
			subtitle: edit.subtitle ?? saved?.subtitle ?? fresh?.subtitle ?? "",
			items: [
				...(saved?.items || []).map((item) => this.#itemView(item)),
				...this.newItems
					.filter((item) => item.sectionId === id)
					.map((item) => ({
						id: item.id,
						name: item.name.trim(),
						description: item.description.trim(),
						prices: withPrice([], cleanPrice(item.price)),
						drinkType: "",
						otherMenus: [],
						mark: "new" as const,
					})),
			],
			mark,
			movedTo: this.moved[id] ? this.menuNames[this.moved[id]] || "another menu" : "",
		};
	}

	view = $derived<DraftChapter[]>(
		this.arranged("").map((id) => ({
			...this.#blockView(id),
			groups: this.arranged(id).map((groupId) => this.#blockView(groupId)),
		})),
	);

	// Items.

	/** What the item's editor opens with. */
	quick(id: string): QuickEdit {
		const fresh = this.newItems.find((item) => item.id === id);
		if (fresh) return { name: fresh.name, description: fresh.description, price: fresh.price };
		const edit = this.itemEdits[id];
		if (edit) return { ...edit };
		const item = this.#savedItem(id);
		return item ? quickOf(item) : { name: "", description: "", price: "" };
	}

	/** Change an item's name, line or first price: a new one's, or a saved one's (back as saved is no change). */
	editItem(id: string, edit: QuickEdit) {
		const index = this.newItems.findIndex((item) => item.id === id);
		if (index >= 0) {
			this.newItems = this.newItems.map((item, i) => (i === index ? { ...item, ...edit } : item));
			return;
		}
		const item = this.#savedItem(id);
		if (!item) return;
		this.itemEdits = sameQuick(edit, quickOf(item)) ? omit(this.itemEdits, id) : { ...this.itemEdits, [id]: { ...edit } };
	}

	/** A new item at the end of `sectionId`; its draft id. */
	addItem(sectionId: string, edit: QuickEdit): string {
		const id = `${NEW_ITEM}${++this.#next}`;
		this.newItems = [...this.newItems, { ...edit, id, sectionId }];
		return id;
	}

	/**
	 * What taking it off asks, from what the page loaded: delete when it's on
	 * no other menu, else take off. Null for a new item: it just goes.
	 */
	takeOffQuestion(id: string, menuName: string): { title: string; message: string; action: string } | null {
		if (this.isNewItem(id)) return null;
		const item = this.#savedItem(id);
		if (!item) return null;
		const name = this.itemEdits[id]?.name.trim() || item.name;
		return item.otherMenus.length
			? {
					title: `Take ${name} off ${menuName}?`,
					message: `It stays on ${nameList(item.otherMenus)}. It comes off ${menuName} when you save.`,
					action: "Take off",
				}
			: {
					title: `Delete ${name}?`,
					message: `It isn't on any other menu, so it will be deleted, with its recipe, when you save.`,
					action: "Delete",
				};
	}

	/** Mark it to come off (a new one just goes). */
	takeOff(id: string) {
		if (this.isNewItem(id)) {
			this.newItems = this.newItems.filter((item) => item.id !== id);
			return;
		}
		if (!this.takenOff.includes(id)) this.takenOff = [...this.takenOff, id];
	}

	undoTakeOff(id: string) {
		this.takenOff = without(this.takenOff, id);
	}

	// Sections.

	#editSection(id: string, change: SectionEdit) {
		const fresh = this.newSections.find((section) => section.id === id);
		if (fresh) {
			this.newSections = this.newSections.map((section) => (section.id === id ? { ...section, ...change } : section));
			return;
		}
		const saved = this.#savedBlock(id)?.block;
		if (!saved) return;
		const next: SectionEdit = { ...this.sectionEdits[id], ...change };
		if (next.title !== undefined && next.title === saved.title) delete next.title;
		if (next.subtitle !== undefined && next.subtitle === saved.subtitle) delete next.subtitle;
		this.sectionEdits = Object.keys(next).length ? { ...this.sectionEdits, [id]: next } : omit(this.sectionEdits, id);
	}

	renameSection(id: string, title: string) {
		const clean = title.trim();
		if (clean) this.#editSection(id, { title: clean });
	}

	setSubtitle(id: string, subtitle: string) {
		this.#editSection(id, { subtitle: subtitle.trim() });
	}

	/** A new section at the end: a chapter, or a group of `parentId`. Its draft id. */
	addSection(title: string, parentId = ""): string {
		const id = `${NEW_SECTION}${++this.#next}`;
		this.newSections = [...this.newSections, { id, parentId, title: title.trim(), subtitle: "" }];
		return id;
	}

	/**
	 * What removing a saved section asks, from what the page loaded: its
	 * groups, and its items, deleted when they're on no other menu nor
	 * elsewhere on this one. Names as `sectionRemovalQuestion` takes them.
	 */
	removalOf(id: string): { title: string; groups: string[]; deleted: string[]; takenOff: string[] } {
		const chapter = this.view.find((block) => block.sectionId === id);
		const block = chapter || this.view.flatMap((entry) => entry.groups).find((group) => group.sectionId === id);
		if (!block) return { title: "", groups: [], deleted: [], takenOff: [] };
		const inside = chapter ? [chapter, ...chapter.groups] : [block];
		const here = new Set(inside.map((entry) => entry.sectionId));
		const elsewhere = new Set(
			this.view
				.flatMap((entry) => [entry, ...entry.groups])
				.filter((entry) => !here.has(entry.sectionId) && entry.mark !== "removed" && entry.mark !== "moved")
				.flatMap((entry) => entry.items.map((item) => item.id)),
		);
		const deleted: string[] = [];
		const takenOff: string[] = [];
		const seen = new Set<string>();
		for (const item of inside.flatMap((entry) => entry.items)) {
			if (seen.has(item.id) || item.mark === "new" || item.mark === "off") continue;
			seen.add(item.id);
			(item.otherMenus.length || elsewhere.has(item.id) ? takenOff : deleted).push(item.name);
		}
		return {
			title: block.title,
			groups: chapter ? chapter.groups.filter((group) => group.mark !== "new").map((group) => group.title) : [],
			deleted,
			takenOff,
		};
	}

	/** Mark a saved section to come off; a new one, with what's new in it, just goes. */
	removeSection(id: string) {
		if (!this.isNewSection(id)) {
			if (!this.removed.includes(id)) this.removed = [...this.removed, id];
			this.moved = omit(this.moved, id);
			return;
		}
		const goes = new Set([id, ...this.newSections.filter((section) => section.parentId === id).map((section) => section.id)]);
		this.newSections = this.newSections.filter((section) => !goes.has(section.id));
		this.newItems = this.newItems.filter((item) => !goes.has(item.sectionId));
		this.order = Object.fromEntries(
			Object.entries(this.order)
				.filter(([parent]) => !goes.has(parent))
				.map(([parent, ids]) => [parent, ids.filter((entry) => !goes.has(entry))]),
		);
		this.#tidyOrder();
	}

	undoRemoveSection(id: string) {
		this.removed = without(this.removed, id);
	}

	/** Move a saved chapter, with its groups and items, to another menu. */
	moveToMenu(id: string, menuId: string) {
		if (this.isNewSection(id) || !menuId || menuId === this.menuId) return;
		this.moved = { ...this.moved, [id]: menuId };
	}

	undoMove(id: string) {
		this.moved = omit(this.moved, id);
	}

	/** Siblings in a new order (dragged, or Move up/down). */
	setOrder(parent: string, ids: string[]) {
		this.order = { ...this.order, [parent]: [...ids] };
		this.#tidyOrder();
	}

	/** An order that's as it would be anyway is no change. */
	#tidyOrder() {
		this.order = Object.fromEntries(
			Object.entries(this.order).filter(([parent, ids]) => {
				const natural = this.#natural(parent);
				return this.arranged(parent).join() !== natural.join() && ids.length > 0;
			}),
		);
	}

	// Saving.

	#itemName(id: string): string {
		return this.itemEdits[id]?.name.trim() || this.#savedItem(id)?.name || "an item";
	}

	#sectionTitle(id: string): string {
		return this.#blockView(id).title || "a section";
	}

	/** What Save menu does, in order. */
	plan(): SaveStep[] {
		const steps: SaveStep[] = [];
		if (this.detailsDirty) steps.push({ kind: "details", label: "the menu's details", body: menuPayload(this.details) });
		// Chapters before groups: a group needs its chapter.
		const fresh = [...this.newSections].sort((a, b) => Number(Boolean(a.parentId)) - Number(Boolean(b.parentId)));
		for (const section of fresh) {
			if (section.parentId && this.#gone(section.parentId)) continue;
			steps.push({
				kind: "createSection",
				label: `new ${section.parentId ? "group" : "section"} ${section.title}`,
				id: section.id,
				parentId: section.parentId,
				title: section.title,
				subtitle: section.subtitle,
			});
		}
		for (const id of new Set([...Object.keys(this.sectionEdits), ...Object.keys(this.moved)])) {
			if (this.#gone(id)) continue;
			const body: { title?: string; subtitle?: string; menuId?: string } = { ...this.sectionEdits[id] };
			if (this.moved[id]) body.menuId = this.moved[id];
			steps.push({
				kind: "updateSection",
				label: this.moved[id] ? `moving ${this.#sectionTitle(id)} to ${this.menuNames[this.moved[id]] || "another menu"}` : `changes to ${this.#sectionTitle(id)}`,
				id,
				body,
			});
		}
		for (const [id, edit] of Object.entries(this.itemEdits)) {
			if (this.takenOff.includes(id)) continue;
			steps.push({ kind: "updateItem", label: `changes to ${this.#itemName(id)}`, id, edit: cleanQuick(edit) });
		}
		for (const item of this.newItems) {
			if (this.#gone(item.sectionId)) continue;
			steps.push({ kind: "createItem", label: `new item ${item.name.trim()}`, id: item.id, sectionId: item.sectionId, edit: cleanQuick(item) });
		}
		for (const parent of Object.keys(this.order)) {
			if (parent && this.#gone(parent)) continue;
			const ids = this.arranged(parent).filter((id) => !this.moved[id]);
			if (ids.length < 2) continue;
			steps.push({ kind: "order", label: parent ? `the order of ${this.#sectionTitle(parent)}'s groups` : "the order of the sections", parent, ids });
		}
		for (const id of this.takenOff) steps.push({ kind: "takeOff", label: `taking ${this.#itemName(id)} off`, id });
		for (const id of this.removed) steps.push({ kind: "removeSection", label: `removing ${this.#sectionTitle(id)}`, id });
		return steps;
	}

	/** Every section on the menu as saved: taking an item off goes by these. */
	#here(): string[] {
		return this.#savedBlocks().map(({ block }) => block.sectionId);
	}

	/** Write the plan through `port`, stopping at the first step that fails. */
	async save(port: SavePort): Promise<SaveResult> {
		const steps = this.plan();
		const ids: Record<string, string> = {};
		const real = (id: string) => ids[id] ?? id;
		const here = this.#here();
		const done: SaveStep[] = [];
		for (const [index, step] of steps.entries()) {
			try {
				switch (step.kind) {
					case "details":
						await port.details(step.body);
						break;
					case "createSection":
						ids[step.id] = await port.createSection({
							title: step.title,
							subtitle: step.subtitle,
							parentId: step.parentId ? real(step.parentId) : "",
							menuId: this.menuId,
						});
						break;
					case "updateSection":
						await port.updateSection(step.id, step.body);
						break;
					case "updateItem":
						await port.updateItem(step.id, step.edit);
						break;
					case "createItem":
						ids[step.id] = await port.createItem(real(step.sectionId), step.edit);
						break;
					case "order":
						await port.order(step.ids.map(real));
						break;
					case "takeOff":
						await port.takeOff(step.id, here);
						break;
					case "removeSection":
						await port.removeSection(step.id);
						break;
				}
				done.push(step);
			} catch (err) {
				return { done, failed: { step, message: err instanceof Error ? err.message : String(err) }, rest: steps.slice(index + 1), ids };
			}
		}
		return { done, failed: null, rest: [], ids };
	}

	/**
	 * After a save, from the menu as it now is (`details`, `chapters`): what
	 * was written leaves the draft, and what wasn't stays, on the new ids.
	 */
	settle(result: SaveResult, details: MenuInput, chapters: MenuItemChapter[]) {
		const real = (id: string) => result.ids[id] ?? id;
		for (const step of result.done) {
			switch (step.kind) {
				case "details":
					this.details = { ...details, days: [...details.days] };
					break;
				case "createSection":
					this.newSections = this.newSections.filter((section) => section.id !== step.id);
					break;
				case "updateSection":
					this.sectionEdits = omit(this.sectionEdits, step.id);
					this.moved = omit(this.moved, step.id);
					break;
				case "updateItem":
					this.itemEdits = omit(this.itemEdits, step.id);
					break;
				case "createItem":
					this.newItems = this.newItems.filter((item) => item.id !== step.id);
					break;
				case "order":
					this.order = omit(this.order, step.parent);
					break;
				case "takeOff":
					this.takenOff = without(this.takenOff, step.id);
					break;
				case "removeSection":
					this.removed = without(this.removed, step.id);
					break;
			}
		}
		this.newSections = this.newSections.map((section) => ({ ...section, parentId: section.parentId && real(section.parentId) }));
		this.newItems = this.newItems.map((item) => ({ ...item, sectionId: real(item.sectionId) }));
		this.order = Object.fromEntries(Object.entries(this.order).map(([parent, ids]) => [parent && real(parent), ids.map(real)]));
		this.savedDetails = { ...details, days: [...details.days] };
		this.saved = chapters;
		// What's no longer there (a section removed with its items) can't be changed.
		this.sectionEdits = Object.fromEntries(Object.entries(this.sectionEdits).filter(([id]) => this.#exists(id)));
		this.moved = Object.fromEntries(Object.entries(this.moved).filter(([id]) => this.#exists(id)));
		this.removed = this.removed.filter((id) => this.#exists(id));
		this.newSections = this.newSections.filter((section) => !section.parentId || this.#exists(section.parentId));
		this.newItems = this.newItems.filter((item) => this.#exists(item.sectionId));
		this.takenOff = this.takenOff.filter((id) => this.#savedItem(id));
		const edits = this.itemEdits;
		this.itemEdits = {};
		for (const [id, edit] of Object.entries(edits)) this.editItem(id, edit);
		const sections = this.sectionEdits;
		this.sectionEdits = {};
		for (const [id, edit] of Object.entries(sections)) this.#editSection(id, edit);
		this.order = Object.fromEntries(Object.entries(this.order).filter(([parent]) => !parent || this.#exists(parent)));
		this.#tidyOrder();
	}
}

/** What a save that stopped says: what was saved, what wasn't, and that the rest is kept. */
export function saveReport(result: SaveResult): string {
	if (!result.failed) return "";
	const saved = result.done.length ? `Saved ${nameList(result.done.map((step) => step.label), 4)}. ` : "Nothing was saved. ";
	const notSaved = [result.failed.step, ...result.rest].map((step) => step.label);
	return `${saved}Couldn't save ${result.failed.step.label}: ${result.failed.message} Not saved yet: ${nameList(notSaved, 4)}; it's all still here to save.`;
}
