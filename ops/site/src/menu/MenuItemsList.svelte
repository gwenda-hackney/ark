<script lang="ts">
	/**
	 * A menu's page (#305) laid out as the website does, and shaped right
	 * there: each section under its name and line, its items, then its groups.
	 * Everything here changes the page's draft (menu-page-draft.svelte.ts);
	 * nothing is written until Save menu. What's changed is marked: an edited
	 * item or section has a dot, a new one says New, and one to come off
	 * stays in sight, struck through, with Undo.
	 *
	 * - Names and lines change where they show (MenuSectionHead, InlineEdit).
	 * - Sections move by their handle (drag, or arrow keys) or Move up/down
	 *   in their ⋯ menu; Add section and Add group put new ones at the end;
	 *   Remove marks one to come off, asking first when it has anything in it.
	 * - An item's pencil (on hover) opens it in a large editor dialog: name,
	 *   price, line; Done puts the change on the page. Take off this menu, in
	 *   the dialog or by the bin, asks first, straight away, from what the
	 *   page loaded (each item's other menus). Add item opens it empty.
	 */
	import { Button, Confirm, ConfirmDialog, Dialog, EditorActionBar, Field, InlineEdit, NativeSelect, TextArea, TextField, type OverflowItem } from "../ui";
	import { Icon } from "../app/shell";
	import { menuItemPath, navigate } from "../app/nav";
	import { toast } from "../ui/toast.svelte";
	import { InlineItemEditor, type ItemDraft, type ItemEditTarget } from "./item-inline-edit.svelte";
	import type { DraftBlock, DraftItem, MenuPageDraft } from "./menu-page-draft.svelte";
	import { sectionRemovalQuestion } from "./menu-page-items";
	import { moveId } from "./menu-sections.js";
	import { normalizePrices } from "./prices.js";
	import MenuSectionHead from "./MenuSectionHead.svelte";
	import { startSectionDrag } from "./section-drag";
	import { formatPrices } from "./types";

	let {
		page,
		menuName = "this menu",
		menuId,
		menus = [],
		busy = false,
		dirty = $bindable(false),
	}: {
		/** The page's draft: what's shown, and what Save menu writes. */
		page: MenuPageDraft;
		menuName?: string;
		/** The menu shown. */
		menuId: string;
		/** Every menu, for moving a section to another. */
		menus?: { id: string; name: string }[];
		/** Save menu is writing: nothing changes meanwhile. */
		busy?: boolean;
		/** The item dialog is open with changes not yet Done: leaving the page asks first. */
		dirty?: boolean;
	} = $props();

	const confirm = new Confirm();
	const editor = new InlineItemEditor((label) =>
		confirm.ask({
			title: `Discard your changes to ${label}?`,
			message: "You've changed it and haven't put it on the menu.",
			action: "Discard",
			cancel: "Keep editing",
		}),
	);

	$effect(() => {
		dirty = editor.dirty;
	});

	const view = $derived(page.view);

	/** Where a dragged section would land: its parent and the index it goes before. */
	let dropAt = $state<{ parent: string; at: number } | null>(null);
	let dragging = $state<string | null>(null);

	function move(parent: string, siblings: DraftBlock[], index: number, dir: -1 | 1) {
		const ids = siblings.map((block) => block.sectionId);
		if (!ids[index + dir]) return;
		page.setOrder(parent, moveId(ids, index, index + dir));
	}

	let lists: Record<string, HTMLElement | undefined> = $state({});
	function grab(event: PointerEvent, parent: string, siblings: DraftBlock[], index: number) {
		if (busy) return;
		const ids = siblings.map((block) => block.sectionId);
		dragging = ids[index];
		startSectionDrag(event, {
			siblings: () => [...(lists[parent]?.querySelectorAll<HTMLElement>(":scope > [data-section]") || [])],
			ids,
			from: index,
			onover: (at) => (dropAt = at == null ? null : { parent, at }),
			ondrop: (next) => page.setOrder(parent, next),
		});
		const done = () => {
			dragging = null;
			window.removeEventListener("pointerup", done, true);
			window.removeEventListener("pointercancel", done, true);
		};
		window.addEventListener("pointerup", done, true);
		window.addEventListener("pointercancel", done, true);
	}

	async function rename(block: DraftBlock, title: string) {
		page.renameSection(block.sectionId, title);
	}

	async function setSubtitle(block: DraftBlock, subtitle: string) {
		page.setSubtitle(block.sectionId, subtitle);
	}

	/** Remove asks first when the section has anything in it; then it's marked, to go on Save. */
	async function removeSection(block: DraftBlock) {
		if (busy) return;
		if (block.mark !== "new") {
			const question = sectionRemovalQuestion(page.removalOf(block.sectionId), menuName);
			if (question && !(await confirm.ask(question))) return;
		}
		page.removeSection(block.sectionId);
	}

	let addingChapter = $state(false);
	let addingGroupTo = $state<string | null>(null);

	async function addSection(title: string, parentId = "") {
		page.addSection(title, parentId);
	}

	/** Move to another menu: the section, with its groups and items. */
	let moving = $state<DraftBlock | null>(null);
	let moveTo = $state("");
	const otherMenus = $derived(menus.filter((menu) => menu.id !== menuId).map((menu) => ({ value: menu.id, label: menu.name })));

	function moveToMenu() {
		const block = moving;
		if (!block || !moveTo) return;
		page.moveToMenu(block.sectionId, moveTo);
		moving = null;
	}

	function chapterActions(chapter: DraftBlock): OverflowItem[] {
		const fresh = chapter.mark === "new";
		return [
			{ label: "Add group", disabled: busy, onselect: () => (addingGroupTo = chapter.sectionId) },
			{
				label: "Move to another menu…",
				disabled: busy || !otherMenus.length || fresh,
				reason: !otherMenus.length ? "There's no other menu" : fresh ? "Save it here first" : undefined,
				onselect: () => {
					moving = chapter;
					moveTo = otherMenus[0]?.value || "";
				},
			},
		];
	}

	// Items: the editor opens over the page.

	function openItem(item: DraftItem) {
		void editor.open({ kind: "item", id: item.id, label: item.name }, page.quick(item.id));
	}

	function openNew(block: DraftBlock) {
		void editor.open({ kind: "new", sectionId: block.sectionId, label: `the new item in ${block.title}` });
	}

	async function applyItem(target: ItemEditTarget, draft: ItemDraft) {
		if (target.kind === "item") page.editItem(target.id, draft);
		else page.addItem(target.sectionId, draft);
	}

	/** Done: the change goes on the page (and is saved with Save menu). */
	async function submitItem(event?: Event) {
		event?.preventDefault();
		const problem = await editor.save(applyItem);
		if (problem) toast.error(problem);
	}

	/** Take off: asks straight away (from what the page loaded), then marks it. A new one just goes. */
	async function remove(item: DraftItem) {
		if (busy) return;
		const question = page.takeOffQuestion(item.id, menuName);
		if (question && !(await confirm.ask(question))) return;
		page.takeOff(item.id);
		if (editor.isOpen(item.id)) editor.cancel();
	}

	/** The items and sections shown, for the dialog to find what it edits. */
	const itemById = $derived(
		new Map(view.flatMap((chapter) => [chapter, ...chapter.groups]).flatMap((block) => block.items.map((item) => [item.id, item] as const))),
	);
	const blockById = $derived(new Map(view.flatMap((chapter) => [chapter, ...chapter.groups]).map((block) => [block.sectionId, block] as const)));

	/** Closing the dialog: changes not yet Done ask first. */
	async function closeItem() {
		if (editor.saving) return;
		if (editor.dirty) {
			const ok = await confirm.ask({
				title: `Discard your changes to ${editor.target?.label || "this item"}?`,
				message: "You've changed it and haven't put it on the menu.",
				action: "Discard",
				cancel: "Keep editing",
			});
			if (!ok) return;
		}
		editor.cancel();
	}

	/** The dialog's ⋯: the item's full page. Take off is a button of its own. */
	function itemActions(item: DraftItem | null): OverflowItem[] {
		if (!item || item.mark === "new") return [];
		return [
			{
				label: "All details",
				onselect: async () => {
					await closeItem();
					if (!editor.target) navigate(menuItemPath(item.name));
				},
			},
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
					saveLabel={item ? "Done" : "Add item"}
					saving={editor.saving}
					dirty={editor.dirty}
					overflow={itemActions(item)}
					onsave={() => void submitItem()}
				>
					{#snippet start()}
						{#if item}
							<!-- In plain sight, phones too; it asks first (remove). -->
							<Button variant="ghost" size="sm" type="button" class="take-off" disabled={editor.saving || busy} onclick={() => void remove(item)}>
								{#snippet icon()}<Icon name="trash" size={14} />{/snippet}
								Take off this menu
							</Button>
						{/if}
					{/snippet}
				</EditorActionBar>
			</div>
		{/snippet}
	</Dialog>
{/snippet}

{#snippet itemRow(item: DraftItem, locked: boolean)}
	{@const price = formatPrices(item)}
	{@const off = item.mark === "off"}
	<li class:off>
		<div class="row">
			<div class="item">
				<span class="text">
					<span class="name">
						{item.name}
						{#if item.mark === "edited"}<span class="mark-dot" title="Edited: saved with Save menu" aria-label="edited"></span>{/if}
						{#if item.mark === "new"}<span class="mark-new">New</span>{/if}
					</span>
					{#if item.description}<span class="description">{item.description}</span>{/if}
				</span>
				{#if price}<span class="price tnum">{price}</span>{/if}
			</div>
			{#if off}
				<button type="button" class="undo" disabled={busy || locked} onclick={() => page.undoTakeOff(item.id)} aria-label={`Keep ${item.name} on ${menuName}`} title={item.otherMenus.length ? "Comes off when you save" : "Deleted when you save"}>
					Undo
				</button>
			{:else}
				<button type="button" class="tool edit" disabled={busy || locked} onclick={() => openItem(item)} aria-label={`Edit ${item.name}`} title="Edit">
					<Icon name="pencil" size={14} />
				</button>
				<button type="button" class="tool remove" disabled={busy || locked} onclick={() => void remove(item)} aria-label={`Take ${item.name} off ${menuName}`} title="Take off this menu">
					<Icon name="trash" size={14} />
				</button>
			{/if}
		</div>
	</li>
{/snippet}

{#snippet items(block: DraftBlock, locked: boolean)}
	{#if block.items.length}
		<ul class="items">
			{#each block.items as item (item.id)}{@render itemRow(item, locked)}{/each}
		</ul>
	{/if}
	<button type="button" class="add" disabled={busy || locked} onclick={() => openNew(block)}>
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
		{@const chapterGone = chapter.mark === "removed" || chapter.mark === "moved"}
		<section
			class="chapter"
			class:gone={chapterGone}
			class:fresh={chapter.mark === "new"}
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
				mark={chapter.mark}
				movedTo={chapter.movedTo}
				onundo={() => (chapter.mark === "moved" ? page.undoMove(chapter.sectionId) : page.undoRemoveSection(chapter.sectionId))}
			/>
			{#if chapter.items.length || !chapter.groups.length}{@render items(chapter, chapterGone)}{/if}
			<div class="groups" bind:this={lists[chapter.sectionId]}>
				{#each chapter.groups as group, groupIndex (group.sectionId)}
					<div
						class="group"
						class:gone={group.mark === "removed"}
						class:fresh={group.mark === "new"}
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
							busy={busy || chapterGone}
							ongrab={(event) => grab(event, chapter.sectionId, chapter.groups, groupIndex)}
							onmove={(dir) => move(chapter.sectionId, chapter.groups, groupIndex, dir)}
							onrename={(title) => rename(group, title)}
							onsubtitle={(subtitle) => setSubtitle(group, subtitle)}
							onremove={() => void removeSection(group)}
							mark={group.mark}
							movedTo={group.movedTo}
							onundo={() => page.undoRemoveSection(group.sectionId)}
						/>
						{@render items(group, chapterGone || group.mark === "removed")}
					</div>
				{/each}
			</div>
			{#if addingGroupTo === chapter.sectionId}
				{@render newSection(chapter.sectionId)}
			{:else}
				<button type="button" class="add add-group" disabled={busy || chapterGone} onclick={() => (addingGroupTo = chapter.sectionId)}>
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
		<Field label="Menu" for="move-section-menu" hint="It goes with its groups and items when you save.">
			<NativeSelect id="move-section-menu" size="sm" bind:value={moveTo} options={otherMenus} />
		</Field>
	</div>
	{#snippet footer()}
		<span class="spacer"></span>
		<Button variant="outline" type="button" onclick={() => (moving = null)}>Cancel</Button>
		<Button variant="primary" type="button" disabled={busy || !moveTo} onclick={moveToMenu}>Move</Button>
	{/snippet}
</Dialog>

{@render itemDialog()}

<ConfirmDialog {confirm} />

<style>
	/* One column at every width, up to a readable line: the sections stack
	   in their order, whatever the window's size. */
	.chapters {
		max-width: 64rem;
		display: grid;
		grid-template-columns: 1fr;
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

	/* Dragging: a copy follows the pointer (section-drag.ts). The section
	   itself empties into a placeholder of the same size, so it's plain it's
	   being moved and nothing else on the page shifts; a bar shows where it
	   lands. */
	.dragged {
		border-style: dashed !important;
		border-color: var(--border-strong, var(--fg-muted)) !important;
		background: color-mix(in srgb, var(--fg) 3%, transparent) !important;
		box-shadow: none !important;
	}

	.dragged > :global(*) {
		visibility: hidden;
	}

	/* While a section moves, only the drop bar marks a place: no hover glow. */
	.dragging-any .group:not(.dragged):hover {
		border-color: var(--border);
		background: var(--surface-2);
	}

	.dragging-any .chapter:hover {
		border-color: var(--border);
		box-shadow: none;
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

	/* The pencil and bin sit on the name's line, level with the price. */
	.row {
		display: flex;
		align-items: flex-start;
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

	/* Gold like the names above it, a step quieter. */
	.price {
		flex-shrink: 0;
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
		color: color-mix(in srgb, var(--primary) 70%, var(--fg-muted));
	}

	/* A hairline between items, so the rows read apart. */
	.items > li + li {
		border-top: 1px solid var(--border);
	}

	/* Draft marks: an edited dot, New, and one to come off struck through (not gold or red). */
	.name {
		display: inline-flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.mark-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--warning);
		align-self: center;
	}

	.mark-new {
		padding: 0 var(--space-2);
		border-radius: 999px;
		font-size: var(--text-xs, 0.75rem);
		font-weight: 600;
		line-height: 1.5;
		color: var(--info);
		background: color-mix(in srgb, var(--info) 15%, transparent);
	}

	.off .item {
		text-decoration: line-through;
		opacity: 0.55;
	}

	.undo {
		flex-shrink: 0;
		align-self: center;
		margin-right: var(--space-1);
		min-height: 1.75rem;
		padding: 0 var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: none;
		color: var(--fg);
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.undo:hover:not(:disabled) {
		background: var(--surface-2);
	}

	/* A section to come off: its items dim with it. */
	.gone > :global(:not(.head)) {
		opacity: 0.55;
	}

	.fresh {
		border-style: dashed;
		border-color: color-mix(in srgb, var(--info) 45%, var(--border));
	}

	/* The pencil and the bin: there on hover (always, without hover). */
	.tool:disabled {
		cursor: default;
	}

	.tool {
		flex-shrink: 0;
		display: inline-grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		/* Centred on the name's first line: the item's top padding, plus half
		   a line, less half the button. */
		margin-top: calc(var(--space-2) + 0.5lh - 0.875rem);
		font-size: var(--text-sm);
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

	/* A group's head is a faint gold header band above its items. */
	.group > :global(.head) {
		margin: calc(var(--space-2) * -1) calc(var(--space-3) * -1) var(--space-1);
		padding: var(--space-2) var(--space-3) var(--space-2);
		border-bottom: 1px solid var(--border);
		border-radius: var(--radius-md) var(--radius-md) 0 0;
		background: color-mix(in srgb, var(--primary) 5%, var(--surface-2));
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

	.item-dialog-bar :global(.take-off) {
		color: var(--danger);
	}

	/* Phones: the pencil and the bin are always there (no hover). The fields go full width. */
	@media (max-width: 900px) {
		.fields {
			grid-template-columns: 1fr;
		}

		.fields :global(.line-field) {
			grid-column: auto;
		}
	}
</style>
