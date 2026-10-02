<script lang="ts">
	/**
	 * Add a recipe line from inventory (or create stock in place).
	 * Used inside the add-ingredient dialog.
	 */
	import { tick } from "svelte";
	import { Button, BusyOverlay, Field, NativeSelect, TextField } from "../ui";
	import type { SelectOption } from "../ui/types";
	import * as api from "../app/api";
	import { INVENTORY_KINDS, type InventoryItem, type InventoryKind } from "../inventory/types";
	import { UNITS, type Ingredient } from "./types";

	let {
		inventory = $bindable([] as InventoryItem[]),
		active = false,
		mode = "add",
		defaultQuantity = "",
		initial = null,
		onpick,
	}: {
		inventory?: InventoryItem[];
		/** When true, focus qty for a fresh add (or search when editing). */
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
	let query = $state("");
	let abvDraft = $state("");
	let kindDraft = $state<InventoryKind>("liquor");
	let busy = $state(false);
	let error = $state("");
	let qtyEl = $state<HTMLInputElement | undefined>();
	let searchEl = $state<HTMLInputElement | undefined>();
	let wasActive = false;

	const q = $derived(query.trim());
	const qLower = $derived(q.toLowerCase());

	const catalog = $derived(
		[...inventory]
			.filter((item) => item.active !== false && String(item.name || "").trim())
			.sort((a, b) =>
				String(a.name || "").localeCompare(String(b.name || "")),
			),
	);

	const matches = $derived.by(() => {
		if (!qLower) return catalog.slice(0, 10);
		return catalog
			.filter((item) =>
				[item.name, item.fullName]
					.filter(Boolean)
					.join(" ")
					.toLowerCase()
					.includes(qLower),
			)
			.slice(0, 10);
	});

	const exact = $derived(
		catalog.find(
			(item) => String(item.name || "").trim().toLowerCase() === qLower,
		),
	);

	const showCreate = $derived(Boolean(q) && !exact);

	const kindOptions: SelectOption[] = INVENTORY_KINDS.map((row) => ({
		value: row.value,
		label: row.label,
	}));

	const unitOptions: SelectOption[] = UNITS.map((u) => ({
		value: u,
		label: u,
	}));

	$effect(() => {
		const now = active;
		if (now && !wasActive) {
			qty = String(initial?.quantity ?? defaultQuantity ?? "").trim();
			unit = String(initial?.unit || "ml").trim() || "ml";
			query = String(initial?.name || "").trim();
			abvDraft = "";
			kindDraft = "liquor";
			error = "";
			void tick().then(() => {
				if (mode === "edit") searchEl?.focus();
				else qtyEl?.focus();
			});
		}
		wasActive = now;
	});

	function resolveUnit(item: InventoryItem): string {
		const chosen = unit.trim();
		if (chosen) return chosen;
		return item.defaultUnit || "ml";
	}

	function lineFromItem(item: InventoryItem): Ingredient {
		const raw = qty.trim();
		const parsed = raw ? Number(raw.replace(/,/g, "")) : NaN;
		const quantity = Number.isFinite(parsed) ? parsed : undefined;
		return {
			name: item.name,
			unit: resolveUnit(item),
			inventoryId: String(item._id || item.id || ""),
			...(quantity != null ? { quantity } : {}),
		};
	}

	async function afterPick() {
		if (mode === "edit") return;
		query = "";
		qty = String(defaultQuantity || "").trim();
		error = "";
		abvDraft = "";
		await tick();
		qtyEl?.focus();
	}

	function pick(item: InventoryItem) {
		onpick(lineFromItem(item));
		void afterPick();
	}

	async function createAndPick() {
		if (!q || busy) return;
		try {
			busy = true;
			error = "";
			const data = await api.createInventoryItem({
				name: q,
				kind: kindDraft,
				abv: abvDraft.replace(/%/g, "").trim(),
				defaultUnit: unit.trim() || "ml",
				active: true,
			});
			const item = data.item;
			inventory = [...inventory, item].sort((a, b) =>
				String(a.name || "").localeCompare(String(b.name || "")),
			);
			onpick(lineFromItem(item));
			kindDraft = "liquor";
			await afterPick();
		} catch (err) {
			error =
				err instanceof Error ? err.message : "Could not add to inventory.";
		} finally {
			busy = false;
		}
	}

	function submitSearch() {
		if (exact) {
			pick(exact);
			return;
		}
		if (matches[0] && qLower) {
			pick(matches[0]);
			return;
		}
		if (showCreate) void createAndPick();
	}
</script>

<div class="form" aria-busy={busy || undefined}>
	<BusyOverlay active={busy} label="Adding to inventory…" />
	<div class="row">
		<Field label="Qty" for="add-ing-qty">
			<input
				bind:this={qtyEl}
				id="add-ing-qty"
				class="input qty"
				type="text"
				inputmode="decimal"
				autocomplete="off"
				bind:value={qty}
				onkeydown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						searchEl?.focus();
					}
				}}
			/>
		</Field>
		<Field label="Unit" for="add-ing-unit">
			<NativeSelect
				id="add-ing-unit"
				size="sm"
				options={unitOptions}
				bind:value={unit}
			/>
		</Field>
	</div>

	<Field label="Ingredient" for="add-ing-search">
		<input
			bind:this={searchEl}
			id="add-ing-search"
			class="input"
			type="search"
			autocomplete="off"
			bind:value={query}
			onkeydown={(e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					submitSearch();
				}
			}}
		/>
	</Field>

	<div class="results scrollbar-fade" role="listbox" aria-label="Inventory matches">
		{#if matches.length}
			{#each matches as item (item._id || item.id)}
				<button
					type="button"
					class="option"
					class:exact={exact &&
						(item._id || item.id) === (exact._id || exact.id)}
					onclick={() => pick(item)}
				>
					<span class="name">
						{#if qty.trim()}
							<span class="qty-preview"
								>{qty.trim()}{unit.trim() ? ` ${unit.trim()}` : ""}</span
							>
						{/if}
						{item.name}
					</span>
					<span class="meta">
						{[
							item.fullName &&
							item.fullName.trim().toLowerCase() !==
								String(item.name || "").trim().toLowerCase()
								? item.fullName
								: null,
							INVENTORY_KINDS.find((k) => k.value === item.kind)?.label,
							item.abv ? `${String(item.abv).replace(/%/g, "")}%` : null,
						]
							.filter(Boolean)
							.join(" · ")}
					</span>
				</button>
			{/each}
		{:else if q}
			<p class="empty">No inventory match for “{q}”.</p>
		{:else}
			<p class="empty">Search inventory, or type a new name to create it.</p>
		{/if}
	</div>

	{#if showCreate}
		<div class="create">
			<p class="create-title">Add “{q}” to inventory</p>
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
				<Field label="ABV %" for="inv-abv-quick">
					<TextField
						id="inv-abv-quick"
						size="sm"
						inputmode="decimal"
						bind:value={abvDraft}
					/>
				</Field>
			</div>
			<Button
				variant="primary"
				size="sm"
				type="button"
				disabled={busy}
				{busy}
				onclick={() => void createAndPick()}
			>
				{busy ? "Adding…" : mode === "edit" ? "Save to inventory and update" : "Add to inventory and recipe"}
			</Button>
			{#if error}
				<p class="error">{error}</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.form {
		position: relative;
		display: grid;
		gap: 0.85rem;
	}

	.row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.65rem;
	}

	.input {
		display: block;
		width: 100%;
		height: var(--control-h-sm);
		box-sizing: border-box;
		margin: 0;
		padding: 0 0.65rem;
		border: 1px solid var(--input);
		border-radius: var(--radius-md);
		background: var(--sunken);
		color: var(--foreground);
		font: inherit;
		font-size: var(--text);
	}

	.qty {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		text-align: right;
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
		padding: 0.3rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--sunken);
	}

	.option {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		width: 100%;
		margin: 0;
		padding: 0.55rem 0.65rem;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--foreground);
		font: inherit;
		font-size: var(--text);
		text-align: left;
		cursor: pointer;
	}

	.option:hover,
	.option.exact {
		background: var(--accent);
	}

	.name {
		min-width: 0;
	}

	.qty-preview {
		margin-right: 0.35rem;
		color: var(--primary);
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.meta {
		flex-shrink: 0;
		font-size: var(--text-xs);
		color: var(--muted-foreground);
	}

	.empty {
		margin: 0;
		padding: 0.75rem 0.65rem;
		font-size: var(--text);
		color: var(--muted-foreground);
	}

	.create {
		display: grid;
		gap: 0.65rem;
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--primary-wash) 55%, var(--card));
	}

	.create-title {
		margin: 0;
		font-size: var(--text);
		font-weight: 500;
		color: var(--foreground);
	}

	.error {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--error, #c97a7a);
	}
</style>
