<script lang="ts">
	/**
	 * A menu's page (#305) laid out as the website does, and shaped right
	 * there: each section under its name and line, its items, then its groups.
	 *
	 * - Names and lines change where they show (MenuSectionHead, InlineEdit).
	 * - Sections move by their handle (drag, or arrow keys) or Move up/down
	 *   in their ⋯ menu; Add section and Add group put new ones at the end;
	 *   Remove takes one off the menu, asking first when it has anything in it.
	 * - An item's pencil (on hover) opens it in a large editor dialog with the
	 *   standard save bar: name, price, line; All details and Take off in its
	 *   ⋯ (item-inline-edit.svelte.ts holds the draft). Add item opens it empty.
	 */
	import { Button, Confirm, ConfirmDialog, Dialog, EditorActionBar, Field, InlineEdit, NativeSelect, TextArea, TextField, type OverflowItem } from "../ui";
	import { Icon } from "../app/shell";
	import * as api from "../app/api";
	import { menuItemPath, navigate } from "../app/nav";
	import { toast } from "../ui/toast.svelte";
	import { menuItemPayload } from "./item-payload";
	import { InlineItemEditor, type ItemDraft, type ItemEditTarget } from "./item-inline-edit.svelte";
	import { cleanPrice, offMenu, sectionRemovalQuestion, withQuickEdit } from "./menu-page-items";
	import { moveId } from "./menu-sections.js";
	import { normalizePrices } from "./prices.js";
	import MenuSectionHead from "./MenuSectionHead.svelte";
	import { startSectionDrag } from "./section-drag";
	import { formatPrices, type MenuItemBlock, type MenuItemChapter, type MenuPageItem } from "./types";

	let {
		chapters,
		menuName = "this menu",
		menuId,
		menus = [],
		dirty = $bindable(false),
		onchanged,
	}: {
		chapters: MenuItemChapter[];
		menuName?: string;
		/** The menu shown: a new section goes on it. */
		menuId: string;
		/** Every menu, for moving a section to another. */
		menus?: { id: string; name: string }[];
		/** An item is open with changes not yet saved: leaving the page asks first. */
		dirty?: boolean;
		/** After anything changes: the page loads the menu again. */
		onchanged: () => Promise<void> | void;
	} = $props();

	const confirm = new Confirm();
	const editor = new InlineItemEditor((label) =>
		confirm.ask({
			title: `Discard your changes to ${label}?`,
			message: "You've changed it and haven't saved it.",
			action: "Discard",
			cancel: "Keep editing",
		}),
	);

	$effect(() => {
		dirty = editor.dirty;
	});

	/** Sections being saved (renamed, moved, removed): their controls wait. */
	let busy = $state(false);

	/**
	 * A new order shows as soon as it's dropped, before the page reloads:
	 * siblings' ids by their parent ("" for the chapters).
	 */
	let pendingOrder = $state<Record<string, string[]>>({});
	function ordered<T extends { sectionId: string }>(list: T[], parent: string): T[] {
		const ids = pendingOrder[parent];
		if (!ids) return list;
		const at = new Map(ids.map((id, index) => [id, index]));
		return [...list].sort((a, b) => (at.get(a.sectionId) ?? 0) - (at.get(b.sectionId) ?? 0));
	}
	const view = $derived(
		ordered(chapters, "").map((chapter) => ({ ...chapter, groups: ordered(chapter.groups, chapter.sectionId) })),
	);

	/** Every section on this menu: taking an item off goes by these. */
	const here = $derived(chapters.flatMap((chapter) => [chapter.sectionId, ...chapter.groups.map((group) => group.sectionId)]));

	/** Where a dragged section would land: its parent and the index it goes before. */
	let dropAt = $state<{ parent: string; at: number } | null>(null);
	let dragging = $state<string | null>(null);

	async function sectionWork(work: () => Promise<unknown>, failed: string) {
		busy = true;
		try {
			await work();
			await onchanged();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : failed);
			throw err;
		} finally {
			busy = false;
		}
	}

	async function saveOrder(parent: string, ids: string[]) {
		pendingOrder = { ...pendingOrder, [parent]: ids };
		try {
			await sectionWork(() => api.orderSections(ids), "Couldn't move it.");
		} catch {
			// Back as it was: the toast says why.
		} finally {
			const { [parent]: _, ...rest } = pendingOrder;
			pendingOrder = rest;
		}
	}

	function move(parent: string, siblings: MenuItemBlock[], index: number, dir: -1 | 1) {
		const ids = siblings.map((block) => block.sectionId);
		if (!ids[index + dir]) return;
		void saveOrder(parent, moveId(ids, index, index + dir));
	}

	let lists: Record<string, HTMLElement | undefined> = $state({});
	function grab(event: PointerEvent, parent: string, siblings: MenuItemBlock[], index: number) {
		if (busy) return;
		const ids = siblings.map((block) => block.sectionId);
		dragging = ids[index];
		startSectionDrag(event, {
			siblings: () => [...(lists[parent]?.querySelectorAll<HTMLElement>(":scope > [data-section]") || [])],
			ids,
			from: index,
			onover: (at) => (dropAt = at == null ? null : { parent, at }),
			ondrop: (next) => void saveOrder(parent, next),
		});
		const done = () => {
			dragging = null;
			window.removeEventListener("pointerup", done, true);
			window.removeEventListener("pointercancel", done, true);
		};
		window.addEventListener("pointerup", done, true);
		window.addEventListener("pointercancel", done, true);
	}

	function rename(block: MenuItemBlock, title: string) {
		return sectionWork(() => api.updateSection(block.sectionId, { title }), "Couldn't rename it.");
	}

	function setSubtitle(block: MenuItemBlock, subtitle: string) {
		return sectionWork(() => api.updateSection(block.sectionId, { subtitle }), "Couldn't save the line.");
	}

	async function removeSection(block: MenuItemBlock) {
		if (busy) return;
		let question: ReturnType<typeof sectionRemovalQuestion>;
		try {
			question = sectionRemovalQuestion((await api.previewSectionRemoval(block.sectionId)).removal, menuName);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't check what's in it.");
			return;
		}
		if (question && !(await confirm.ask(question))) return;
		try {
			await sectionWork(() => api.removeSection(block.sectionId), "Couldn't remove it.");
			toast.ok(`${block.title} is off ${menuName}.`);
		} catch {
			// The toast says why.
		}
	}

	let addingChapter = $state(false);
	let addingGroupTo = $state<string | null>(null);

	function addSection(title: string, parentId = "") {
		return sectionWork(
			() => api.createSection(parentId ? { title, parentId } : { title, parentId: "", menuId }),
			"Couldn't add it.",
		);
	}

	/** Move to another menu: the section, with its groups and items. */
	let moving = $state<MenuItemBlock | null>(null);
	let moveTo = $state("");
	const otherMenus = $derived(menus.filter((menu) => menu.id !== menuId).map((menu) => ({ value: menu.id, label: menu.name })));

	async function moveToMenu() {
		const block = moving;
		if (!block || !moveTo) return;
		const name = menus.find((menu) => menu.id === moveTo)?.name || "the other menu";
		try {
			await sectionWork(() => api.updateSection(block.sectionId, { menuId: moveTo }), "Couldn't move it.");
			moving = null;
			toast.ok(`${block.title} moved to ${name}.`);
		} catch {
			// The toast says why.
		}
	}

	function chapterActions(chapter: MenuItemBlock): OverflowItem[] {
		return [
			{ label: "Add group", disabled: busy, onselect: () => (addingGroupTo = chapter.sectionId) },
			{
				label: "Move to another menu…",
				disabled: busy || !otherMenus.length,
				reason: otherMenus.length ? undefined : "There's no other menu",
				onselect: () => {
					moving = chapter;
					moveTo = otherMenus[0]?.value || "";
				},
			},
		];
	}

	// Items: the editor opens where the item sits.

	function firstPrice(item: MenuPageItem): string {
		return normalizePrices(item)[0]?.price || "";
	}

	function openItem(item: MenuPageItem) {
		void editor.open({ kind: "item", id: item.id, label: item.name }, { name: item.name, description: item.description, price: firstPrice(item) });
	}

	function openNew(block: MenuItemBlock) {
		void editor.open({ kind: "new", sectionId: block.sectionId, label: `the new item in ${block.title}` });
	}

	async function saveItem(target: ItemEditTarget, draft: ItemDraft) {
		if (target.kind === "item") {
			const { item: full } = await api.getItem(target.id);
			await api.updateItem(target.id, menuItemPayload(withQuickEdit(full, draft)));
		} else {
			const name = draft.name.trim();
			const price = cleanPrice(draft.price);
			await api.createItem({
				name,
				description: draft.description.trim() || undefined,
				sectionId: target.sectionId,
				...(price ? { price, prices: [{ name: "", price }] } : {}),
			});
		}
	}

	async function submitItem(event?: Event) {
		event?.preventDefault();
		const target = editor.target;
		try {
			const problem = await editor.save(saveItem);
			if (problem) return void toast.error(problem);
			await onchanged();
			if (target?.kind === "new") toast.ok("Added.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't save the item.");
		}
	}

	async function remove(item: MenuPageItem) {
		if (busy) return;
		busy = true;
		let plan: ReturnType<typeof offMenu>;
		let full: Awaited<ReturnType<typeof api.getItem>>["item"];
		try {
			full = (await api.getItem(item.id)).item;
			plan = offMenu(full, here);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't load the item.");
			return;
		} finally {
			busy = false;
		}
		const ok = await confirm.ask(
			plan.action === "delete"
				? {
						title: `Delete ${item.name}?`,
						message: `It isn't on any other menu, so taking it off ${menuName} deletes it, with its recipe. This can't be undone.`,
						action: "Delete",
					}
				: {
						title: `Take ${item.name} off ${menuName}?`,
						message: "It stays on its other menus, and you can put it back here from its page.",
						action: "Take off",
					},
		);
		if (!ok) return;
		try {
			await sectionWork(async () => {
				if (plan.action === "delete") await api.deleteItem(item.id);
				else await api.updateItem(item.id, menuItemPayload(plan.item));
			}, "Couldn't take it off.");
			if (editor.isOpen(item.id)) editor.cancel();
			toast.ok(plan.action === "delete" ? `${item.name} deleted.` : `${item.name} is off ${menuName}.`);
		} catch {
			// The toast says why.
		}
	}

	/** The items and sections shown, for the dialog to find what it edits. */
	const itemById = $derived(
		new Map(chapters.flatMap((chapter) => [chapter, ...chapter.groups]).flatMap((block) => block.items.map((item) => [item.id, item] as const))),
	);
	const blockById = $derived(new Map(chapters.flatMap((chapter) => [chapter, ...chapter.groups]).map((block) => [block.sectionId, block] as const)));

	/** Closing the dialog: unsaved changes ask first. */
	async function closeItem() {
		if (editor.saving) return;
		if (editor.dirty) {
			const ok = await confirm.ask({
				title: `Discard your changes to ${editor.target?.label || "this item"}?`,
				message: "You've changed it and haven't saved it.",
				action: "Discard",
				cancel: "Keep editing",
			});
			if (!ok) return;
		}
		editor.cancel();
	}

	/** The dialog's ⋯: the item's full page, and taking it off this menu. */
	function itemActions(item: MenuPageItem | null): OverflowItem[] {
		if (!item) return [];
		return [
			{
				label: "All details",
				onselect: async () => {
					await closeItem();
					if (!editor.target) navigate(menuItemPath(item.name));
				},
			},
			{ label: "Take off this menu", tone: "destructive", disabled: busy, onselect: () => void remove(item) },
		];
	}

	/** The line under an item grows with what's typed, so all of it shows. */
	function autogrow(wrap: HTMLElement) {
		const node = wrap.querySelector("textarea");
		if (!node) return;
		const fit = () => {
			node.style.height = "auto";
			node.style.height = `${node.scrollHeight + 2}px`;
		};
		fit();
		node.addEventListener("input", fit);
		return { destroy: () => node.removeEventListener("input", fit) };
	}

</script>

{#snippet itemDialog()}
	{@const target = editor.target}
	{@const item = target?.kind === "item" ? itemById.get(target.id) || null : null}
	{@const block = target?.kind === "new" ? blockById.get(target.sectionId) || null : null}
	<Dialog
		open={Boolean(target)}
		size="xl"
		title={item ? item.name : block ? `Add an item to ${block.title}` : "Item"}
		onclose={() => void closeItem()}
	>
		<form id="item-dialog-form" class="item-form" novalidate onsubmit={submitItem}>
			<div class="fields">
				<Field class="name-field" label="Name" for="item-dialog-name" required>
					<!-- svelte-ignore a11y_autofocus -->
					<TextField id="item-dialog-name" bind:value={editor.draft.name} autocomplete="off" autofocus />
				</Field>
				<Field class="price-field" label="Price" for="item-dialog-price" optional>
					<TextField id="item-dialog-price" bind:value={editor.draft.price} placeholder="12" inputmode="decimal" autocomplete="off" />
				</Field>
				<Field class="line-field" label="Line under it" for="item-dialog-description" optional hint="What guests read under its name.">
					<div class="grow" use:autogrow>
						<TextArea id="item-dialog-description" rows={4} bind:value={editor.draft.description} />
					</div>
				</Field>
			</div>
			{#if item && normalizePrices(item).length > 1}
				<p class="hint">Only the first price changes here. Its other sizes are under All details.</p>
			{/if}
		</form>
		{#snippet footer()}
			<div class="item-dialog-bar">
				<EditorActionBar
					saveLabel={item ? "Save item" : "Add item"}
					saving={editor.saving}
					dirty={editor.dirty}
					overflow={itemActions(item)}
					onsave={() => void submitItem()}
				/>
			</div>
		{/snippet}
	</Dialog>
{/snippet}

{#snippet itemRow(item: MenuPageItem)}
	{@const price = formatPrices(item)}
	<li>
		<div class="row">
			<div class="item">
				<span class="text">
					<span class="name">{item.name}</span>
					{#if item.description}<span class="description">{item.description}</span>{/if}
				</span>
				{#if price}<span class="price tnum">{price}</span>{/if}
			</div>
			<button type="button" class="tool edit" onclick={() => openItem(item)} aria-label={`Edit ${item.name}`} title="Edit">
				<Icon name="pencil" size={14} />
			</button>
			<button type="button" class="tool remove" onclick={() => void remove(item)} aria-label={`Take ${item.name} off ${menuName}`} title="Take off this menu">
				<Icon name="trash" size={14} />
			</button>
		</div>
	</li>
{/snippet}

{#snippet items(block: MenuItemBlock)}
	{#if block.items.length}
		<ul class="items">
			{#each block.items as item (item.id)}{@render itemRow(item)}{/each}
		</ul>
	{/if}
	<button type="button" class="add" onclick={() => openNew(block)}>
		<Icon name="plus" size={14} />
		Add item
	</button>
{/snippet}

{#snippet newSection(parentId: string)}
	<div class="new-section" class:group-new={Boolean(parentId)}>
		<InlineEdit
			value=""
			label={parentId ? "New group's name" : "New section's name"}
			placeholder={parentId ? "New group's name" : "New section's name"}
			required
			editing={true}
			onsave={(title) => addSection(title, parentId)}
			ondone={() => (parentId ? (addingGroupTo = null) : (addingChapter = false))}
		/>
	</div>
{/snippet}

<div class="chapters" bind:this={lists[""]} class:dragging-any={Boolean(dragging)}>
	{#each view as chapter, chapterIndex (chapter.sectionId)}
		<section
			class="chapter"
			aria-label={chapter.title}
			data-section={chapter.sectionId}
			class:dragged={dragging === chapter.sectionId}
			class:drop-before={dropAt?.parent === "" && dropAt.at === chapterIndex}
			class:drop-after={dropAt?.parent === "" && dropAt.at === view.length && chapterIndex === view.length - 1}
		>
			<MenuSectionHead
				title={chapter.title}
				subtitle={chapter.subtitle}
				level="chapter"
				index={chapterIndex}
				count={view.length}
				{busy}
				extra={chapterActions(chapter)}
				ongrab={(event) => grab(event, "", view, chapterIndex)}
				onmove={(dir) => move("", view, chapterIndex, dir)}
				onrename={(title) => rename(chapter, title)}
				onsubtitle={(subtitle) => setSubtitle(chapter, subtitle)}
				onremove={() => void removeSection(chapter)}
			/>
			{#if chapter.items.length || !chapter.groups.length}{@render items(chapter)}{/if}
			<div class="groups" bind:this={lists[chapter.sectionId]}>
				{#each chapter.groups as group, groupIndex (group.sectionId)}
					<div
						class="group"
						data-section={group.sectionId}
						class:dragged={dragging === group.sectionId}
						class:drop-before={dropAt?.parent === chapter.sectionId && dropAt.at === groupIndex}
						class:drop-after={dropAt?.parent === chapter.sectionId && dropAt.at === chapter.groups.length && groupIndex === chapter.groups.length - 1}
					>
						<MenuSectionHead
							title={group.title}
							subtitle={group.subtitle}
							level="group"
							index={groupIndex}
							count={chapter.groups.length}
							{busy}
							ongrab={(event) => grab(event, chapter.sectionId, chapter.groups, groupIndex)}
							onmove={(dir) => move(chapter.sectionId, chapter.groups, groupIndex, dir)}
							onrename={(title) => rename(group, title)}
							onsubtitle={(subtitle) => setSubtitle(group, subtitle)}
							onremove={() => void removeSection(group)}
						/>
						{@render items(group)}
					</div>
				{/each}
			</div>
			{#if addingGroupTo === chapter.sectionId}
				{@render newSection(chapter.sectionId)}
			{:else}
				<button type="button" class="add add-group" disabled={busy} onclick={() => (addingGroupTo = chapter.sectionId)}>
					<Icon name="plus" size={14} />
					Add group
				</button>
			{/if}
		</section>
	{/each}
</div>
<!-- Under the sections, where a new one goes: a menu of one section keeps the page's width. -->
<div class="add-chapter">
	{#if addingChapter}
		{@render newSection("")}
	{:else}
		<button type="button" class="add" disabled={busy} onclick={() => (addingChapter = true)}>
			<Icon name="plus" size={14} />
			Add section
		</button>
	{/if}
</div>

<Dialog open={Boolean(moving)} title={moving ? `Move ${moving.title} to another menu` : ""} onclose={() => (moving = null)}>
	<div class="move-form">
		<Field label="Menu" for="move-section-menu" hint="It goes with its groups and items.">
			<NativeSelect id="move-section-menu" size="sm" bind:value={moveTo} options={otherMenus} />
		</Field>
	</div>
	{#snippet footer()}
		<span class="spacer"></span>
		<Button variant="outline" type="button" onclick={() => (moving = null)}>Cancel</Button>
		<Button variant="primary" type="button" busy={busy} disabled={busy || !moveTo} onclick={() => void moveToMenu()}>Move</Button>
	{/snippet}
</Dialog>

{@render itemDialog()}

<ConfirmDialog {confirm} />

<style>
	/* A menu of one section takes the page's width, up to a readable line;
	   two or more sit side by side when there's room. */
	.chapters {
		max-width: 64rem;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 28rem), 1fr));
		gap: var(--space-3);
		align-items: start;
	}

	.chapter {
		position: relative;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--panel-bg);
		padding: var(--space-3) var(--space-3) var(--space-2);
	}

	.add-chapter {
		max-width: 64rem;
		margin-top: var(--space-3);
		padding: var(--space-2);
		border: 1px dashed var(--border);
		border-radius: var(--radius-lg);
	}

	.groups {
		display: grid;
	}

	.group {
		position: relative;
		margin-top: var(--space-3);
	}

	/* Dragging: a copy follows the pointer (section-drag.ts) and the section
	   itself folds away, so it's plain it's being moved; a bar shows where it
	   lands. It folds to nothing rather than leaving the page (display: none),
	   so its handle keeps the pointer for the rest of the drag. */
	.dragged {
		height: 0;
		min-height: 0;
		margin: 0 !important;
		padding: 0 !important;
		border: 0 !important;
		overflow: hidden;
		opacity: 0;
	}

	.dragging-any {
		cursor: grabbing;
		user-select: none;
	}

	.drop-before::before,
	.drop-after::after {
		content: "";
		position: absolute;
		left: 0;
		right: 0;
		height: 4px;
		border-radius: 2px;
		background: var(--primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 30%, transparent);
		pointer-events: none;
	}

	.chapter.drop-before::before {
		top: calc(var(--space-3) / -2 - 2px);
	}

	.chapter.drop-after::after {
		bottom: calc(var(--space-3) / -2 - 2px);
	}

	.group.drop-before::before {
		top: calc(var(--space-3) / -2 - 2px);
	}

	.group.drop-after::after {
		bottom: -6px;
	}

	.items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
	}

	.row {
		display: flex;
		align-items: center;
		border-radius: var(--radius-md);
	}

	.row:hover,
	.row:focus-within {
		background: var(--surface-3);
	}

	.item {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		padding: var(--space-2);
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
	}

	.text {
		flex: 1;
		min-width: 0;
		display: grid;
	}

	.name {
		font-size: var(--text-sm);
		font-weight: 500;
	}

	/* The whole line, as guests read it. */
	.description {
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	.price {
		flex-shrink: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	/* The pencil and the bin: there on hover (always, without hover). */
	.tool {
		flex-shrink: 0;
		display: inline-grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border: 0;
		border-radius: var(--radius-md);
		background: none;
		color: var(--fg-muted);
		cursor: pointer;
		opacity: 0;
	}

	.remove {
		margin-right: var(--space-1);
	}

	.row:hover .tool,
	.row:focus-within .tool {
		opacity: 1;
	}

	.edit:hover {
		background: var(--surface-2);
		color: var(--primary);
	}

	.remove:hover {
		color: var(--danger);
	}

	@media (hover: none) {
		.tool {
			opacity: 1;
		}
	}

	/* Hovering a section lights up all of it: its name, items and groups. */
	.chapter,
	.group {
		transition:
			background var(--t-fast, 120ms) ease,
			border-color var(--t-fast, 120ms) ease,
			box-shadow var(--t-fast, 120ms) ease;
	}

	.chapter:hover:not(:has(.group:hover)) {
		border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 25%, transparent);
	}

	/* Each group is a panel of its own inside its section: the map's blocks. */
	.group {
		padding: var(--space-2) var(--space-3) var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-2);
	}

	.group > :global(.head) {
		margin: 0 calc(var(--space-3) * -1) var(--space-1);
		padding: 0 var(--space-3) var(--space-2);
		border-bottom: 1px solid var(--border);
	}

	.chapter > :global(.head) {
		margin-bottom: var(--space-2);
	}

	.group:hover {
		border-color: color-mix(in srgb, var(--primary) 55%, var(--border));
		background: color-mix(in srgb, var(--primary) 5%, var(--surface-2));
	}

	.add {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 2rem;
		padding: 0 var(--space-2);
		border: 0;
		border-radius: var(--radius-md);
		background: none;
		color: var(--fg-muted);
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.add:hover:not(:disabled) {
		background: var(--surface-3);
		color: var(--fg);
	}

	.add:disabled {
		cursor: default;
		opacity: 0.6;
	}

	.add-group {
		margin-top: var(--space-2);
	}

	.add:focus-visible,
	.tool:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.new-section {
		padding: var(--space-1) 0;
		font-weight: 600;
	}

	.new-section.group-new {
		margin-top: var(--space-2);
		font-size: var(--text-sm);
	}

	/* The item's editor dialog: name and price side by side, the line under them. */
	.item-form {
		display: grid;
		gap: var(--space-3);
	}

	.fields {
		display: grid;
		grid-template-columns: 1fr 9rem;
		gap: var(--space-4);
	}

	.fields :global(.line-field) {
		grid-column: 1 / -1;
	}

	.grow :global(textarea) {
		min-height: 6rem;
		resize: vertical;
		field-sizing: content;
	}

	/* The standard save bar, as the dialog's footer. */
	.item-dialog-bar {
		flex: 1;
		min-width: 0;
	}

	.item-dialog-bar :global(.editor-action-bar) {
		position: static;
		margin: 0;
		padding: 0;
		border: 0;
		background: none;
		backdrop-filter: none;
	}

	.spacer {
		flex: 1;
	}

	.move-form {
		display: grid;
		gap: var(--space-3);
	}

	.hint {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	/* Phones: the pencil opens the item, whose ⋯ has Take off. The fields go full width. */
	@media (max-width: 900px) {
		.remove {
			display: none;
		}

		.fields {
			grid-template-columns: 1fr;
		}

		.fields :global(.line-field) {
			grid-column: auto;
		}
	}
</style>
