<script lang="ts">
	/**
	 * A menu's items on its page (#305), laid out as the website does: each
	 * chapter under its name, its own items, then each group under its name.
	 * Click an item to change its name, line or price, or take it off the
	 * menu; Add item puts a new one in that section. Both open one sheet: a
	 * bottom sheet on phones, a dialog on desktop. Everything else about an
	 * item is on its own page (All details).
	 */
	import { Button, Confirm, ConfirmDialog, Dialog, Field, TextField } from "../ui";
	import { Icon } from "../app/shell";
	import * as api from "../app/api";
	import { menuItemPath, navigate } from "../app/nav";
	import { toast } from "../ui/toast.svelte";
	import { menuItemPayload } from "./item-payload";
	import { cleanPrice, offMenu, withQuickEdit } from "./menu-page-items";
	import { normalizePrices } from "./prices.js";
	import { formatPrices, type MenuItemBlock, type MenuItemChapter, type MenuPageItem } from "./types";

	let {
		chapters,
		menuName = "this menu",
		onchanged,
	}: {
		chapters: MenuItemChapter[];
		menuName?: string;
		/** After an item changes: the page loads the menu again. */
		onchanged: () => Promise<void> | void;
	} = $props();

	/** Every section on this menu: taking an item off goes by these. */
	const here = $derived(chapters.flatMap((chapter) => [chapter.sectionId, ...chapter.groups.map((group) => group.sectionId)]));

	let editingId = $state<string | null>(null);
	let addingTo = $state<string | null>(null);
	let draft = $state({ name: "", description: "", price: "" });
	let saving = $state(false);
	const confirm = new Confirm();

	/** The item or the section the sheet is for. */
	const editing = $derived(
		editingId ? chapters.flatMap((c) => [c, ...c.groups]).flatMap((b) => b.items).find((item) => item.id === editingId) ?? null : null,
	);
	const addingSection = $derived(
		addingTo ? chapters.flatMap((c) => [c, ...c.groups]).find((b) => b.sectionId === addingTo) ?? null : null,
	);
	const sheetOpen = $derived(Boolean(editing || addingSection));
	const sheetTitle = $derived(editing ? editing.name : addingSection ? `Add to ${addingSection.title}` : "");

	function submitSheet(event?: Event) {
		event?.preventDefault();
		if (editing) saveEdit(editing);
		else if (addingSection) saveNew(addingSection);
	}

	function sameName(a: string, b: string): boolean {
		return a.trim().localeCompare(b.trim(), undefined, { sensitivity: "base" }) === 0;
	}

	function firstPrice(item: MenuPageItem): string {
		return normalizePrices(item)[0]?.price || "";
	}

	function startEdit(item: MenuPageItem) {
		editingId = item.id;
		addingTo = null;
		draft = { name: item.name, description: item.description, price: firstPrice(item) };
	}

	function startAdd(sectionId: string) {
		addingTo = sectionId;
		editingId = null;
		draft = { name: "", description: "", price: "" };
	}

	function close() {
		editingId = null;
		addingTo = null;
	}

	function priceProblem(): string {
		return draft.price.trim() && !cleanPrice(draft.price) ? "The price isn't a number." : "";
	}

	async function run(work: () => Promise<string>) {
		if (saving) return;
		saving = true;
		try {
			const said = await work();
			close();
			await onchanged();
			if (said) toast.ok(said);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't save the item.");
		} finally {
			saving = false;
		}
	}

	function saveEdit(item: MenuPageItem) {
		if (!draft.name.trim()) return void toast.error("Give it a name.");
		if (priceProblem()) return void toast.error(priceProblem());
		void run(async () => {
			const { item: full } = await api.getItem(item.id);
			await api.updateItem(item.id, menuItemPayload(withQuickEdit(full, draft)));
			return "";
		});
	}

	function saveNew(section: MenuItemBlock) {
		const name = draft.name.trim();
		if (!name) return void toast.error("Give it a name.");
		if (priceProblem()) return void toast.error(priceProblem());
		const price = cleanPrice(draft.price);
		void run(async () => {
			await api.createItem({
				name,
				description: draft.description.trim() || undefined,
				sectionId: section.sectionId,
				...(price ? { price, prices: [{ name: "", price }] } : {}),
			});
			return `${name} added to ${section.title}.`;
		});
	}

	async function remove(item: MenuPageItem) {
		if (saving) return;
		saving = true;
		let plan: ReturnType<typeof offMenu>;
		let full: Awaited<ReturnType<typeof api.getItem>>["item"];
		try {
			full = (await api.getItem(item.id)).item;
			plan = offMenu(full, here);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't load the item.");
			return;
		} finally {
			saving = false;
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
		await run(async () => {
			if (plan.action === "delete") {
				await api.deleteItem(item.id);
				return `${item.name} deleted.`;
			}
			await api.updateItem(item.id, menuItemPayload(plan.item));
			return `${item.name} is off ${menuName}.`;
		});
	}

	function openItem(event: MouseEvent, href: string) {
		if (event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		navigate(href);
	}
</script>

{#snippet fields(id: string)}
	<div class="fields">
		<Field label="Name" for={`${id}-name`} required>
			<TextField id={`${id}-name`} size="sm" bind:value={draft.name} autocomplete="off" />
		</Field>
		<Field label="Price" for={`${id}-price`} optional>
			<TextField id={`${id}-price`} size="sm" bind:value={draft.price} placeholder="12" inputmode="decimal" autocomplete="off" />
		</Field>
		<Field class="wide" label="Line under it" for={`${id}-description`} optional>
			<TextField id={`${id}-description`} size="sm" bind:value={draft.description} autocomplete="off" />
		</Field>
	</div>
{/snippet}

{#snippet itemRow(item: MenuPageItem)}
	{@const price = formatPrices(item)}
	<li>
		<div class="row">
				<button type="button" class="item" onclick={() => startEdit(item)} aria-label={`Change ${item.name}`}>
					<span class="text">
						<span class="name">{item.name}</span>
						{#if item.description}<span class="description">{item.description}</span>{/if}
					</span>
					{#if price}<span class="price tnum">{price}</span>{/if}
				</button>
				<button type="button" class="remove" onclick={() => void remove(item)} aria-label={`Take ${item.name} off ${menuName}`} title="Take off this menu">
					<Icon name="trash" size={14} />
				</button>
			</div>
	</li>
{/snippet}

{#snippet block(section: MenuItemBlock)}
	{#if section.items.length}
		<ul class="items">
			{#each section.items as item (item.id)}{@render itemRow(item)}{/each}
		</ul>
	{/if}
		<button type="button" class="add" onclick={() => startAdd(section.sectionId)}>
			<Icon name="plus" size={14} />
			Add item
		</button>
{/snippet}

{#if chapters.length}
	<div class="chapters">
		{#each chapters as chapter (chapter.sectionId)}
			<section class="chapter" aria-label={chapter.title}>
				<!-- A chapter named after the menu (Chez Pickle's) doesn't say its name again under the page's. -->
				{#if !sameName(chapter.title, menuName)}<h3 class="chapter-name">{chapter.title}</h3>{/if}
				{#if chapter.subtitle}<p class="note">{chapter.subtitle}</p>{/if}
				{#if chapter.items.length || !chapter.groups.length}{@render block(chapter)}{/if}
				{#each chapter.groups as group (group.sectionId)}
					<div class="group">
						<h4 class="group-name">{group.title}</h4>
						{#if group.subtitle}<p class="note">{group.subtitle}</p>{/if}
						{@render block(group)}
					</div>
				{/each}
			</section>
		{/each}
	</div>
{:else}
	<p class="muted">Give the menu a section below, then add its items here.</p>
{/if}

<!-- One sheet for changing an item and for adding one: from the bottom on
     phones, a dialog on desktop. -->
<Dialog open={sheetOpen} sheet title={sheetTitle} onclose={close}>
	<form class="sheet-form" novalidate onsubmit={submitSheet}>
		{@render fields(editing ? `item-${editing.id}` : `new-${addingTo}`)}
		{#if editing && normalizePrices(editing).length > 1}
			<p class="hint">Only the first price changes here. Its other sizes are under All details.</p>
		{/if}
		{#if editing}
			<a class="details" href={menuItemPath(editing.name)} onclick={(event) => openItem(event, menuItemPath(editing.name))}>
				Recipe, photo and all other details
				<Icon name="chevron-right" size={14} />
			</a>
		{/if}
		<button type="submit" hidden aria-hidden="true" tabindex="-1"></button>
	</form>
	{#snippet footer()}
		{#if editing}
			<Button variant="ghost" type="button" class="take-off" disabled={saving} onclick={() => editing && void remove(editing)}>
				{#snippet icon()}<Icon name="trash" size={16} />{/snippet}
				Take off
			</Button>
		{/if}
		<span class="spacer"></span>
		<Button variant="primary" type="button" busy={saving} disabled={saving} onclick={() => submitSheet()}>
			{#snippet icon()}<Icon name={editing ? "save" : "plus"} size={16} />{/snippet}
			{editing ? "Save" : "Add"}
		</Button>
	{/snippet}
</Dialog>

<ConfirmDialog {confirm} />

<style>
	/* A menu of one chapter takes the page's width, up to a readable line;
	   two or more sit side by side when there's room. */
	.chapters {
		max-width: 64rem;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 28rem), 1fr));
		gap: var(--space-3);
		align-items: start;
	}

	.chapter {
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--panel-bg);
		padding: var(--space-3) var(--space-3) var(--space-2);
	}

	.chapter-name {
		margin: 0 0 var(--space-1);
		padding: 0 var(--space-2);
		font-family: var(--font);
		font-size: var(--text-base);
		font-weight: 600;
		line-height: var(--leading-base);
	}

	.group {
		margin-top: var(--space-3);
	}

	.group-name {
		margin: 0;
		padding: 0 var(--space-2);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.note {
		margin: 0;
		padding: 0 var(--space-2);
		font-size: var(--text-sm);
		font-style: italic;
		color: var(--fg-muted);
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
		cursor: pointer;
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

	.remove {
		flex-shrink: 0;
		display: inline-grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		margin-right: var(--space-1);
		border: 0;
		border-radius: var(--radius-md);
		background: none;
		color: var(--fg-muted);
		cursor: pointer;
		opacity: 0;
	}

	.row:hover .remove,
	.row:focus-within .remove {
		opacity: 1;
	}

	.remove:hover {
		color: var(--danger);
	}

	/* A phone has no hover: the bin is always there. */
	@media (hover: none) {
		.remove {
			opacity: 1;
		}
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

	.add:hover {
		background: var(--surface-3);
		color: var(--fg);
	}

	.add:focus-visible,
	.item:focus-visible,
	.remove:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.sheet-form {
		display: grid;
		gap: var(--space-4);
	}

	.fields {
		display: grid;
		grid-template-columns: 1fr 6rem;
		gap: var(--space-3);
	}

	.fields :global(.wide) {
		grid-column: 1 / -1;
	}

	:global(.btn.take-off) {
		color: var(--danger);
	}

	.details {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		justify-self: start;
		font-size: var(--text-sm);
		color: var(--primary);
		text-decoration: none;
	}

	.spacer {
		flex: 1;
	}

	/* Phones: the sheet has Take off; the row is just the item to tap. */
	@media (max-width: 900px) {
		.remove {
			display: none;
		}
	}

	.hint,
	.muted {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
</style>
