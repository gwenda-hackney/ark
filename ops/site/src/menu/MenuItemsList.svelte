<script lang="ts">
	/**
	 * A menu's items on its page (#305), laid out as the website does: each
	 * chapter under its name, its own items, then each group under its name.
	 * Click an item to change its name, line or price there, or take it off
	 * the menu; Add item puts a new one in that section. Everything else about
	 * an item is on its own page (All details).
	 */
	import { Button, Confirm, ConfirmDialog, Field, TextField } from "../ui";
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

	function saveEdit(event: Event, item: MenuPageItem) {
		event.preventDefault();
		if (!draft.name.trim()) return void toast.error("Give it a name.");
		if (priceProblem()) return void toast.error(priceProblem());
		void run(async () => {
			const { item: full } = await api.getItem(item.id);
			await api.updateItem(item.id, menuItemPayload(withQuickEdit(full, draft)));
			return "";
		});
	}

	function saveNew(event: Event, section: MenuItemBlock) {
		event.preventDefault();
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
		{#if editingId === item.id}
			<form class="edit" novalidate onsubmit={(event) => saveEdit(event, item)}>
				{@render fields(`item-${item.id}`)}
				{#if normalizePrices(item).length > 1}
					<p class="hint">Only the first price changes here. Its other sizes are under All details.</p>
				{/if}
				<div class="actions">
					<Button variant="ghost" size="sm" type="button" class="danger" onclick={() => void remove(item)}>
						{#snippet icon()}<Icon name="trash" size={14} />{/snippet}
						Take off
					</Button>
					<a class="details" href={menuItemPath(item.name)} onclick={(event) => openItem(event, menuItemPath(item.name))}>All details</a>
					<span class="spacer"></span>
					<Button variant="outline" size="sm" type="button" onclick={close}>Cancel</Button>
					<Button variant="primary" size="sm" type="submit" busy={saving} disabled={saving}>
						{#snippet icon()}<Icon name="save" size={14} />{/snippet}
						Save
					</Button>
				</div>
			</form>
		{:else}
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
		{/if}
	</li>
{/snippet}

{#snippet block(section: MenuItemBlock)}
	{#if section.items.length}
		<ul class="items">
			{#each section.items as item (item.id)}{@render itemRow(item)}{/each}
		</ul>
	{/if}
	{#if addingTo === section.sectionId}
		<form class="edit" novalidate onsubmit={(event) => saveNew(event, section)}>
			{@render fields(`new-${section.sectionId}`)}
			<div class="actions">
				<span class="spacer"></span>
				<Button variant="outline" size="sm" type="button" onclick={close}>Cancel</Button>
				<Button variant="primary" size="sm" type="submit" busy={saving} disabled={saving}>
					{#snippet icon()}<Icon name="plus" size={14} />{/snippet}
					Add
				</Button>
			</div>
		</form>
	{:else}
		<button type="button" class="add" onclick={() => startAdd(section.sectionId)}>
			<Icon name="plus" size={14} />
			Add item
		</button>
	{/if}
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

<ConfirmDialog {confirm} />

<style>
	.chapters {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
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

	.description {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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

	.edit {
		display: grid;
		gap: var(--space-3);
		margin: var(--space-1) 0 var(--space-2);
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-2);
	}

	.fields {
		display: grid;
		grid-template-columns: 1fr 6rem;
		gap: var(--space-3);
	}

	.fields :global(.wide) {
		grid-column: 1 / -1;
	}

	.actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.actions :global(.danger) {
		color: var(--danger);
	}

	.details {
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	.spacer {
		flex: 1;
	}

	.hint,
	.muted {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
</style>
