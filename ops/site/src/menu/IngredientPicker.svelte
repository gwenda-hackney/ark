<script lang="ts">
	import { ITEM_TIPS } from "./item-help";
	import { Icon } from "../app/shell";
	/**
	 * Add a recipe line: find the stock first, then say how much. Picking a
	 * match selects it and moves to the quantity, with the unit the stock
	 * comes in; Add (or Enter) puts the line in. No match offers to create
	 * the stock in place. Used inside the add and change ingredient dialogs.
	 */
	import { tick } from "svelte";
	import { Button, BusyOverlay, Field, NativeSelect, NumberField } from "../ui";
	import type { SelectOption } from "../ui/types";
	import * as api from "../app/api";
	import { INVENTORY_KINDS, type InventoryItem, type InventoryKind } from "../inventory/types";
	import { UNITS, type Ingredient } from "./types";
	import {
		addLabel,
		exactStock,
		lineFromStock,
		matchStock,
		pickCatalog,
		stockId,
		unitForStock,
	} from "./ingredient-pick";

	let {
		inventory = $bindable([] as InventoryItem[]),
		active = false,
		mode = "add",
		defaultQuantity = "",
		initial = null,
		onpick,
	}: {
		inventory?: InventoryItem[];
		/** Opening: reset and focus the search. */
		active?: boolean;
		mode?: "add" | "edit";
		/** Prefill qty (pint for draught, 25ml for a pour). */
		defaultQuantity?: string;
		/** Seed fields when opening in edit mode. */
		initial?: {
			quantity?: string;
			unit?: string;
			name?: string;
		} | null;
		onpick: (line: Ingredient) => void;
	} = $props();

	let qty = $state("");
	let unit = $state("ml");
	let unitTouched = $state(false);
	let query = $state("");
	let selected = $state<InventoryItem | null>(null);
	let highlight = $state(0);
	let abvDraft = $state("");
	let kindDraft = $state<InventoryKind>("liquor");
	let busy = $state(false);
	let error = $state("");
	let searchEl = $state<HTMLInputElement | undefined>();
	let wasActive = false;

	const catalog = $derived(pickCatalog(inventory));
	const matches = $derived(matchStock(catalog, query));
	const exact = $derived(exactStock(catalog, query));
	const showCreate = $derived(Boolean(query.trim()) && !exact && !selected);
	const buttonLabel = $derived(addLabel(selected, qty, unit, mode));

	const kindOptions: SelectOption[] = INVENTORY_KINDS.map((row) => ({
		value: row.value,
		label: row.label,
	}));

	const unitOptions: SelectOption[] = UNITS.map((u) => ({ value: u, label: u }));

	$effect(() => {
		const now = active;
		if (now && !wasActive) {
			qty = String(initial?.quantity ?? defaultQuantity ?? "").trim();
			unit = String(initial?.unit || "ml").trim() || "ml";
			unitTouched = Boolean(initial?.unit);
			query = String(initial?.name || "").trim();
			selected = mode === "edit" ? exactStock(pickCatalog(inventory), query) || null : null;
			highlight = 0;
			abvDraft = "";
			kindDraft = "liquor";
			error = "";
			void tick().then(() => {
				searchEl?.focus();
				searchEl?.select();
			});
		}
		wasActive = now;
	});

	// Typing again starts a new search.
	$effect(() => {
		void query;
		highlight = 0;
	});

	async function focusQty() {
		await tick();
		const el = document.getElementById("add-ing-qty") as HTMLInputElement | null;
		el?.focus();
		el?.select();
	}

	function choose(item: InventoryItem) {
		selected = item;
		query = String(item.name || "");
		unit = unitForStock(item, unit, unitTouched);
		error = "";
		void focusQty();
	}

	function clearChoice() {
		selected = null;
		void tick().then(() => searchEl?.focus());
	}

	async function afterAdd() {
		if (mode === "edit") return;
		query = "";
		selected = null;
		qty = String(defaultQuantity || "").trim();
		unitTouched = false;
		error = "";
		abvDraft = "";
		await tick();
		searchEl?.focus();
	}

	function add() {
		if (!selected) return;
		onpick(lineFromStock(selected, qty, unit));
		void afterAdd();
	}

	async function createAndPick() {
		const name = query.trim();
		if (!name || busy) return;
		try {
			busy = true;
			error = "";
			const data = await api.createInventoryItem({
				name,
				kind: kindDraft,
				abv: abvDraft.replace(/%/g, "").trim(),
				defaultUnit: unit.trim() || "ml",
				active: true,
			});
			const item = data.item;
			inventory = [...inventory, item].sort((a, b) =>
				String(a.name || "").localeCompare(String(b.name || "")),
			);
			kindDraft = "liquor";
			choose(item);
		} catch (err) {
			error = err instanceof Error ? err.message : "Could not add to inventory.";
		} finally {
			busy = false;
		}
	}

	function onSearchKey(e: KeyboardEvent) {
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			if (!matches.length) return;
			e.preventDefault();
			const step = e.key === "ArrowDown" ? 1 : -1;
			highlight = (highlight + step + matches.length) % matches.length;
			return;
		}
		if (e.key !== "Enter") return;
		e.preventDefault();
		if (selected && String(selected.name || "") === query) {
			void focusQty();
			return;
		}
		const hit = exact || matches[highlight];
		if (hit && query.trim()) choose(hit);
	}

	function onSearchInput() {
		// Editing the name drops the pick, so what's typed is what's searched.
		if (selected && String(selected.name || "") !== query) selected = null;
	}

	function metaFor(item: InventoryItem): string {
		return [
			item.fullName &&
			item.fullName.trim().toLowerCase() !== String(item.name || "").trim().toLowerCase()
				? item.fullName
				: null,
			INVENTORY_KINDS.find((k) => k.value === item.kind)?.label,
			item.abv ? `${String(item.abv).replace(/%/g, "")}%` : null,
		]
			.filter(Boolean)
			.join(" · ");
	}
</script>

<div class="form" aria-busy={busy || undefined}>
	<BusyOverlay active={busy} label="Adding to inventory…" />

	<Field label="Ingredient" for="add-ing-search" tooltip={ITEM_TIPS.ingredientSearch}>
		<input
			bind:this={searchEl}
			id="add-ing-search"
			class="input"
			type="search"
			autocomplete="off"
			placeholder="Gin, lime, tonic…"
			role="combobox"
			aria-expanded={!selected}
			aria-controls="add-ing-results"
			aria-activedescendant={!selected && matches[highlight] ? `add-ing-opt-${highlight}` : undefined}
			bind:value={query}
			oninput={onSearchInput}
			onkeydown={onSearchKey}
		/>
	</Field>

	{#if selected}
		<div class="chosen">
			<div class="chosen-text">
				<span class="chosen-name">{selected.name}</span>
				{#if metaFor(selected)}<span class="meta">{metaFor(selected)}</span>{/if}
			</div>
			<button type="button" class="link" onclick={clearChoice}>Change</button>
		</div>
	{:else}
		<div class="results scrollbar-fade" id="add-ing-results" role="listbox" aria-label="Stock matches">
			{#if matches.length}
				{#each matches as item, index (stockId(item))}
					<button
						type="button"
						class="option"
						id={`add-ing-opt-${index}`}
						role="option"
						aria-selected={index === highlight}
						class:active={index === highlight}
						onclick={() => choose(item)}
					>
						<span class="name">{item.name}</span>
						<span class="meta">{metaFor(item)}</span>
					</button>
				{/each}
			{:else if query.trim()}
				<p class="empty">No stock called “{query.trim()}”.</p>
			{:else}
				<p class="empty">No stock yet. Type a name to add it.</p>
			{/if}
		</div>
	{/if}

	{#if showCreate}
		<div class="create">
			<p class="create-title">Add “{query.trim()}” to stock</p>
			<div class="row">
				<Field label="Kind" for="inv-kind-quick">
					<NativeSelect
						id="inv-kind-quick"
						size="sm"
						options={kindOptions}
						value={kindDraft}
						onchange={(e) => {
							kindDraft = e.currentTarget.value as InventoryKind;
						}}
					/>
				</Field>
				<Field label="ABV" for="inv-abv-quick" width="sm" optional>
					<NumberField
						id="inv-abv-quick"
						size="sm"
						unit="%"
						min={0}
						max={100}
						decimals={1}
						noun="a percentage"
						bind:value={abvDraft}
					/>
				</Field>
			</div>
			<Button variant="outline" size="sm" type="button" disabled={busy} {busy} onclick={() => void createAndPick()}>
				{#snippet icon()}<Icon name="plus" size={14} />{/snippet}
				{busy ? "Adding…" : "Add to stock"}
			</Button>
			{#if error}
				<p class="error">{error}</p>
			{/if}
		</div>
	{/if}

	<div class="amount">
		<Field label="How much" for="add-ing-qty" width="sm">
			<NumberField
				id="add-ing-qty"
				size="sm"
				min={0}
				decimals={2}
				noun="a quantity"
				bind:value={qty}
				onkeydown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						add();
					}
				}}
			/>
		</Field>
		<Field label="Unit" for="add-ing-unit" width="sm">
			<NativeSelect
				id="add-ing-unit"
				size="sm"
				options={unitOptions}
				value={unit}
				onchange={(e) => {
					unit = e.currentTarget.value;
					unitTouched = true;
				}}
			/>
		</Field>
	</div>

	<Button variant="primary" size="sm" type="button" disabled={!selected || busy} onclick={add}>
		{#snippet icon()}<Icon name="plus" size={14} />{/snippet}
		{buttonLabel}
	</Button>
</div>

<style>
	.form {
		position: relative;
		display: grid;
		gap: var(--space-3);
	}

	.row,
	.amount {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
	}

	.input {
		display: block;
		width: 100%;
		height: var(--control-h-sm);
		box-sizing: border-box;
		margin: 0;
		padding: 0 var(--space-3);
		border: 1px solid var(--input);
		border-radius: var(--radius-md);
		background: var(--sunken);
		color: var(--foreground);
		font: inherit;
		font-size: var(--text-base);
	}

	.input:focus {
		outline: none;
		border-color: var(--ring);
		box-shadow: 0 0 0 3px var(--ring-wash);
	}

	.results {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		max-height: 14rem;
		overflow: auto;
		padding: var(--space-1);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: transparent;
	}

	.option {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		width: 100%;
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--foreground);
		font: inherit;
		font-size: var(--text-base);
		text-align: left;
		cursor: pointer;
	}

	.option:hover,
	.option.active {
		background: var(--surface-3);
	}

	.option:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: -2px;
	}

	.name {
		min-width: 0;
	}

	.meta {
		flex-shrink: 0;
		font-size: var(--text-xs);
		color: var(--muted-foreground);
	}

	.chosen {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--primary-border, var(--primary));
		border-radius: var(--radius-md);
		background: var(--primary-wash);
	}

	.chosen-text {
		display: grid;
		gap: 0.1rem;
		min-width: 0;
	}

	.chosen-name {
		font-weight: 600;
	}

	.link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--primary);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}

	.link:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.empty {
		margin: 0;
		padding: var(--space-3);
		font-size: var(--text-base);
		color: var(--muted-foreground);
	}

	.create {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-1);
	}

	.create-title {
		margin: 0;
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--foreground);
	}

	.error {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--danger);
	}

	@media (max-width: 900px) {
		.option {
			min-height: 2.75rem;
			align-items: center;
		}

		.input {
			height: 2.5rem;
		}
	}
</style>
