<script lang="ts">
	import { onMount } from "svelte";
	import {
		BusyOverlay,
		Button,
		Card,
		Field,
		PageHeader,
		SearchField,
		TextField,
	} from "../../ui";
	import { getMenu } from "../../lib/api";
	import { toast } from "../../lib/toast.svelte";
	import { sectionPathLabel } from "../../lib/menu-sections";
	import type { MenuItem, MenuSection } from "../../lib/types";
	import {
		collectMenuItems,
		DEFAULT_LIGHTSPEED_MENU,
		lightspeedItemUpdateCsv,
		lightspeedMenuLayoutCsv,
		storedLightspeedSku,
	} from "../../../../functions/_lib/lightspeed-stock.js";
	import LightspeedTabs from "./LightspeedTabs.svelte";

	let sections = $state<MenuSection[]>([]);
	let loading = $state(true);
	let error = $state("");
	let query = $state("");
	let menuName = $state(DEFAULT_LIGHTSPEED_MENU);
	let selected = $state<Record<string, boolean>>({});

	const items = $derived(collectMenuItems(sections) as MenuItem[]);
	const filtered = $derived(filterItems(items, query));
	const selectedItems = $derived(
		items.filter((item) => selected[itemId(item)]),
	);
	const selectedWithSku = $derived(
		selectedItems.filter((item) => storedLightspeedSku(item)),
	);
	const selectedMissingSku = $derived(
		selectedItems.filter((item) => !storedLightspeedSku(item)),
	);
	const layoutCsv = $derived(
		selectedWithSku.length ? lightspeedMenuLayoutCsv(selectedWithSku) : "",
	);
	const updateCsv = $derived(
		selectedWithSku.length ? lightspeedItemUpdateCsv(selectedWithSku) : "",
	);
	const layoutPreview = $derived(csvPreview(layoutCsv));
	const updatePreview = $derived(csvPreview(updateCsv));

	onMount(() => {
		void load();
	});

	async function load() {
		loading = true;
		error = "";
		try {
			const data = await getMenu();
			sections = data.sections || [];
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Could not load menu items.";
			error = message;
			toast.error(message);
		} finally {
			loading = false;
		}
	}

	function itemId(item: MenuItem) {
		return String(item._id || item.id || "");
	}

	function filterItems(rows: MenuItem[], raw: string) {
		const q = raw.trim().toLowerCase();
		if (!q) return rows;
		return rows.filter((item) => {
			const hay = [
				item.name,
				item.lightspeedSku,
				sectionPathLabel(item.section),
			]
				.filter(Boolean)
				.join(" ")
				.toLowerCase();
			return hay.includes(q);
		});
	}

	function csvPreview(csv: string) {
		return csv
			.trim()
			.split("\n")
			.slice(0, 8)
			.join("\n");
	}

	function toggle(item: MenuItem) {
		const id = itemId(item);
		if (!id) return;
		selected = { ...selected, [id]: !selected[id] };
	}

	function selectFilteredWithSku() {
		const next = { ...selected };
		for (const item of filtered) {
			if (storedLightspeedSku(item)) next[itemId(item)] = true;
		}
		selected = next;
	}

	function clearSelected() {
		selected = {};
	}

	function download(filename: string, csv: string) {
		if (!csv) return;
		const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	function fileSlug() {
		if (selectedWithSku.length === 1) {
			return String(selectedWithSku[0].name || "item")
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-|-$/g, "");
		}
		return `${selectedWithSku.length}-items`;
	}
</script>

<div class="page scrollbar-fade">
	<PageHeader
		title="POS export"
		subtitle="Pick drinks that already have a Lightspeed SKU. Place them on a new menu without taking them off the current one, or export an item list to try in-place edits."
	>
		{#snippet actions()}
			<Button
				variant="outline"
				size="sm"
				disabled={!filtered.some((item) => storedLightspeedSku(item))}
				onclick={selectFilteredWithSku}
			>
				Select with SKU
			</Button>
			<Button
				variant="ghost"
				size="sm"
				disabled={!selectedItems.length}
				onclick={clearSelected}
			>
				Clear
			</Button>
		{/snippet}
		<LightspeedTabs view="export" />
	</PageHeader>

	<div class="stack">
		<Card
			title="How Lightspeed splits this"
			subtitle="The item library is the catalogue. Menus are layouts that point at SKUs. An item can sit on more than one menu."
		>
			<ol class="steps">
				<li>
					<strong>New menu, keep the current one.</strong>
					In Back Office create a menu named {menuName || "Gwenda Next"} (Menu
					management, empty is fine). Download the menu layout for one drink (Negroni
					is a good first test). Open that new menu, More actions, Import. Leave
					Replace the menu with the content of the file off. The SKU is added to
					this menu. It should still be on the live menu.
				</li>
				<li>
					<strong>In-place edits.</strong>
					Download the item update for the same drink. Item list, Import, File
					import. Map SKU, Type, and only the columns you changed. Skip Menu/Screen
					if that column appears. SKU is the key, so this updates the live library
					row rather than creating a copy.
				</li>
			</ol>
		</Card>

		<Card title="Export" subtitle="{selectedWithSku.length} of {selectedItems.length} selected drinks have a SKU.">
			<div class="export-bar">
				<Field label="New menu name" for="ls-export-menu">
					<TextField id="ls-export-menu" size="sm" bind:value={menuName} />
				</Field>
				<div class="export-actions">
					<Button
						variant="primary"
						size="sm"
						disabled={!layoutCsv}
						onclick={() =>
							download(`lightspeed-menu-layout-${fileSlug()}.csv`, layoutCsv)}
					>
						Download menu layout
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={!updateCsv}
						onclick={() =>
							download(`lightspeed-item-update-${fileSlug()}.csv`, updateCsv)}
					>
						Download item update
					</Button>
				</div>
			</div>
			{#if selectedMissingSku.length}
				<p class="warn">
					{selectedMissingSku.length}
					{selectedMissingSku.length === 1 ? "drink has" : "drinks have"} no
					Lightspeed SKU yet. Stamp SKUs on Reconcile first, or leave them unselected.
				</p>
			{/if}
			{#if layoutPreview}
				<div class="previews">
					<div>
						<p class="preview-label">Menu layout (SKU + Screens)</p>
						<pre class="preview">{layoutPreview}</pre>
					</div>
					<div>
						<p class="preview-label">Item update (no Menu/Screen)</p>
						<pre class="preview">{updatePreview}</pre>
					</div>
				</div>
			{/if}
		</Card>

		<Card title="Menu items">
			{#snippet actions()}
				<SearchField
					bind:value={query}
					placeholder="Filter drinks"
					ariaLabel="Filter drinks"
					count={query ? filtered.length : undefined}
					width="14rem"
				/>
			{/snippet}
			{#if error}
				<p class="error">{error}</p>
			{:else if !loading && items.length === 0}
				<p class="muted">No menu items yet.</p>
			{:else if filtered.length === 0}
				<p class="muted">No drinks match that filter.</p>
			{:else}
				<table class="table">
					<thead>
						<tr>
							<th class="check">
								<span class="sr-only">Selected</span>
							</th>
							<th>Name</th>
							<th>Section</th>
							<th>SKU</th>
							<th>Price</th>
						</tr>
					</thead>
					<tbody>
						{#each filtered as item (itemId(item))}
							{@const id = itemId(item)}
							{@const sku = storedLightspeedSku(item)}
							<tr class:on={Boolean(selected[id])}>
								<td class="check">
									<input
										type="checkbox"
										checked={Boolean(selected[id])}
										disabled={!id}
										aria-label={`Select ${item.name || "drink"}`}
										onchange={() => toggle(item)}
									/>
								</td>
								<td>{item.name || ""}</td>
								<td>{sectionPathLabel(item.section)}</td>
								<td class="mono-cell">{sku || "No SKU"}</td>
								<td class="num">{item.price || ""}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</Card>
	</div>

	<BusyOverlay active={loading} label="Loading menu items…" />
</div>

<style>
	.page {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gutter);
	}

	.stack {
		display: grid;
		gap: var(--gap-lg);
		max-width: 64rem;
		align-content: start;
	}

	.steps {
		margin: 0;
		padding-left: 1.15rem;
		display: grid;
		gap: var(--gap);
		font-size: var(--text-sm);
		line-height: 1.55;
		color: var(--muted-foreground);
	}

	.steps strong {
		color: var(--foreground);
	}

	.export-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--gap);
	}

	.export-bar :global(.field) {
		flex: 1 1 14rem;
	}

	.export-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.warn,
	.error {
		margin: var(--gap-sm) 0 0;
		font-size: var(--text-sm);
	}

	.warn {
		color: var(--muted-foreground);
	}

	.error {
		color: var(--destructive, #c97a7a);
	}

	.muted {
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.previews {
		display: grid;
		gap: var(--gap);
		margin-top: var(--gap);
	}

	@media (min-width: 48rem) {
		.previews {
			grid-template-columns: 1fr 1fr;
		}
	}

	.preview-label {
		margin: 0 0 0.35rem;
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.preview {
		margin: 0;
		padding: 0.75rem 0.85rem;
		overflow-x: auto;
		border-radius: var(--radius-md);
		background: var(--sunken);
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: var(--text-xs);
		line-height: 1.45;
		color: var(--foreground);
	}

	.table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	.table th,
	.table td {
		padding: 0.55rem 0.4rem;
		text-align: left;
		border-bottom: 1px solid var(--border);
		vertical-align: top;
	}

	.table th {
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.table tr:last-child td {
		border-bottom: 0;
	}

	.table tr.on td {
		background: color-mix(in srgb, var(--primary, #c9a84c) 8%, transparent);
	}

	.check {
		width: 1.75rem;
	}

	.check input {
		accent-color: var(--primary, #c9a84c);
	}

	.num {
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.mono-cell {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: var(--text-xs);
		color: var(--muted-foreground);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
