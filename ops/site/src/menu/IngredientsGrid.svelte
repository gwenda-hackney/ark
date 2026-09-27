<script lang="ts">
	/**
	 * Editable recipe lines. Qty / unit / note edit inline.
	 * Click the ingredient name to change stock (dialog). Add via parent +.
	 * Linked stock ABV is resolved from inventory (read-only in the grid).
	 * Line cost comes from the same pour-cost math as analysis.
	 */
	import type { ColDef, ICellRendererParams, ValueSetterParams } from "ag-grid-community";
	import { Button, DataGrid, Dialog, Field, NativeSelect, TextField } from "../ui";
	import { svelteCell } from "../ui/grid";
	import { inventoryItemPath, navigate } from "../app/nav";
	import { inventoryAbvById, resolveIngredientAbv } from "./abv";
	import { costIngredientLine } from "./cost";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../ui/viewport.svelte";
	import {
		UNITS,
		formatGbp,
		type Ingredient,
		type InventoryItem,
	} from "../app/types";
	import IngredientNameCell from "./cells/IngredientNameCell.svelte";
	import RemoveRowCell from "./cells/RemoveRowCell.svelte";
	import IngredientPicker from "./IngredientPicker.svelte";

	type IngRow = Ingredient & {
		_key: string;
		href?: string;
		displayAbv?: string;
		lineCost?: number | null;
		costLabel?: string;
		costHint?: string;
		estimated?: boolean;
	};

	let {
		ingredients = [],
		inventory = $bindable([] as InventoryItem[]),
		onChange,
	}: {
		ingredients?: Ingredient[];
		inventory?: InventoryItem[];
		onChange: (next: Ingredient[]) => void;
	} = $props();

	const phone = mediaMatches(SHELL_MOBILE_QUERY);
	const unitOptions = UNITS.map((unit) => ({ value: unit, label: unit }));

	let editIndex = $state<number | null>(null);

	const abvById = $derived(inventoryAbvById(inventory));

	const catalogById = $derived.by(() => {
		const map = new Map<string, InventoryItem>();
		for (const item of inventory) {
			const id = String(item._id || item.id || "").trim();
			if (id) map.set(id, item);
		}
		return map;
	});

	function costLabel(cost: number | null | undefined, estimated = false): string {
		if (cost == null) return "—";
		const text = formatGbp(cost);
		return estimated ? `~${text}` : text;
	}

	function lineHint(line: ReturnType<typeof costIngredientLine>): string {
		if (line.missing === "unlinked") return "Not linked to stock.";
		if (line.missing === "no-price") return "No trade price.";
		if (line.missing === "no-volume") return "No pour volume.";
		const bits: string[] = [];
		if (line.packPrice != null && line.packMl != null) {
			bits.push(`${formatGbp(line.packPrice)} / ${line.packMl} ml`);
		} else if (line.packPrice != null) {
			bits.push(`${formatGbp(line.packPrice)} each`);
		}
		if (line.estimated) {
			bits.push(line.variable ? "estimate (moves around)" : "estimate");
		} else if (line.assumedSize) {
			bits.push("assumed bottle");
		}
		return bits.join(" · ");
	}

	function stockHref(ing: Ingredient): string | undefined {
		const invId = ing.inventoryId != null ? String(ing.inventoryId).trim() : "";
		if (!invId) return undefined;
		const stock = catalogById.get(invId);
		const path = inventoryItemPath(String(stock?.name || ing.name || "").trim());
		return path.startsWith("/inventory/") ? path : undefined;
	}

	function parseQtyInput(value: unknown): number | undefined | false {
		if (value == null || value === "") return undefined;
		if (typeof value === "number") {
			return Number.isFinite(value) ? value : false;
		}
		const cleaned = String(value).replace(/,/g, "").trim();
		if (!cleaned) return undefined;
		const n = Number(cleaned);
		return Number.isFinite(n) ? n : false;
	}

	const rows = $derived.by((): IngRow[] =>
		ingredients.map((ing, i) => {
			const priced = costIngredientLine(ing, catalogById);
			const qty = parseQtyInput(ing.quantity);
			return {
				...ing,
				quantity: qty === false ? ing.quantity : qty,
				_key: `ing-${i}-${(ing as { id?: string | number }).id ?? ""}`,
				href: stockHref(ing),
				displayAbv: resolveIngredientAbv(ing, abvById) || "",
				lineCost: priced.cost,
				costLabel: costLabel(priced.cost, priced.estimated),
				costHint: lineHint(priced),
				estimated: priced.estimated,
			};
		}),
	);

	const catalog = $derived(
		[...inventory]
			.filter((item) => item.active !== false && String(item.name || "").trim())
			.sort((a, b) =>
				String(a.name || "").localeCompare(String(b.name || "")),
			),
	);

	const editing = $derived(
		editIndex != null ? ingredients[editIndex] ?? null : null,
	);

	function commit(next: Ingredient[]) {
		onChange(next);
	}

	function patchIndex(index: number, patch: Partial<Ingredient>) {
		commit(
			ingredients.map((ing, i) => (i === index ? { ...ing, ...patch } : ing)),
		);
	}

	function removeRow(index: number) {
		onChange(ingredients.filter((_, i) => i !== index));
	}

	function openEdit(index: number) {
		editIndex = index;
	}

	function closeEdit() {
		editIndex = null;
	}

	function applyEdit(line: Ingredient) {
		if (editIndex == null) return;
		const prev = ingredients[editIndex];
		patchIndex(editIndex, {
			...line,
			note: prev?.note,
			abv: undefined,
		});
		closeEdit();
	}

	function findInventory(name: string): InventoryItem | undefined {
		const needle = name.trim().toLowerCase();
		if (!needle) return undefined;
		return catalog.find(
			(item) => String(item.name || "").trim().toLowerCase() === needle,
		);
	}

	function applyName(index: number, next: string | undefined) {
		const match = next ? findInventory(next) : undefined;
		if (match) {
			patchIndex(index, {
				name: match.name,
				abv: undefined,
				inventoryId: String(match._id || match.id || ""),
				unit: ingredients[index]?.unit || match.defaultUnit || "ml",
			});
			return;
		}
		patchIndex(index, {
			name: next,
			inventoryId: undefined,
		});
	}

	function setter(field: keyof Ingredient) {
		return (params: ValueSetterParams<IngRow>) => {
			const index = rows.findIndex((r) => r._key === params.data?._key);
			if (index < 0 || !params.data) return false;
			const value = params.newValue;

			if (field === "quantity") {
				const next = parseQtyInput(value);
				if (next === false) return false;
				params.data.quantity = next;
				patchIndex(index, { quantity: next });
				return true;
			}

			const next =
				value == null || value === "" ? undefined : String(value);

			if (field === "name") {
				applyName(index, next);
				return true;
			}

			if (field === "abv") {
				const row = ingredients[index];
				if (row?.inventoryId) return false;
				params.data.abv = next;
				params.data.displayAbv = next || "";
				patchIndex(index, { abv: next });
				return true;
			}

			(params.data as Record<string, unknown>)[field] = next;
			patchIndex(index, { [field]: next } as Partial<Ingredient>);
			return true;
		};
	}

	const columnDefs = $derived.by((): ColDef<IngRow>[] => [
		{
			headerName: "Qty",
			field: "quantity",
			editable: true,
			width: 88,
			flex: 0,
			type: "num",
			cellDataType: "number",
			valueSetter: setter("quantity"),
		},
		{
			headerName: "Unit",
			field: "unit",
			editable: true,
			width: 96,
			flex: 0,
			cellEditor: "agSelectCellEditor",
			cellEditorParams: { values: [...UNITS] },
			valueSetter: setter("unit"),
		},
		{
			headerName: "Ingredient",
			field: "name",
			editable: false,
			flex: 2.2,
			minWidth: 260,
			cellRenderer: svelteCell(
				IngredientNameCell,
				(params: ICellRendererParams<IngRow>) => ({
					text: params.data?.name || "",
					href: params.data?.href || "",
					onedit: () => {
						const index = rows.findIndex((r) => r._key === params.data?._key);
						if (index >= 0) openEdit(index);
					},
				}),
			),
		},
		{
			headerName: "ABV",
			colId: "abv",
			width: 80,
			flex: 0,
			type: "num",
			cellDataType: "text",
			editable: (params) => !params.data?.inventoryId,
			valueGetter: (params) => params.data?.displayAbv || "",
			valueSetter: setter("abv"),
		},
		{
			headerName: "Price",
			colId: "price",
			width: 96,
			flex: 0,
			type: "num",
			cellDataType: "text",
			editable: false,
			sortable: true,
			cellClass: (params) =>
				params.data?.estimated
					? "num ag-right-aligned-cell muted"
					: "num ag-right-aligned-cell",
			valueGetter: (params) => params.data?.costLabel || "—",
			tooltipValueGetter: (params) => params.data?.costHint || undefined,
		},
		{
			headerName: "Note",
			field: "note",
			editable: true,
			minWidth: 120,
			flex: 1,
			valueSetter: setter("note"),
		},
		{
			headerName: "",
			colId: "remove",
			width: 48,
			minWidth: 48,
			maxWidth: 48,
			flex: 0,
			sortable: false,
			filter: false,
			editable: false,
			cellRenderer: svelteCell(
				RemoveRowCell,
				(params: ICellRendererParams<IngRow>) => ({
					onremove: () => {
						const index = rows.findIndex((r) => r._key === params.data?._key);
						if (index >= 0) removeRow(index);
					},
				}),
			),
		},
	]);
</script>

<div class="grid-wrap">
	{#if ingredients.length === 0}
		<p class="empty">No ingredients yet. Use + to add a line.</p>
	{:else if phone.matches}
		<div class="cards">
			{#each rows as row, index (row._key)}
				<article class="card">
					<header class="card-head">
						<span class="card-name">{row.name || "Untitled"}</span>
						<div class="card-tools">
							<button
								type="button"
								class="card-action"
								title="Change ingredient"
								aria-label="Change ingredient"
								onclick={() => openEdit(index)}
							>
								Edit
							</button>
							{#if row.href}
								<a
									class="card-action"
									href={row.href}
									title="Open in inventory"
									onclick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										navigate(row.href!);
									}}
								>
									Stock
								</a>
							{/if}
							<RemoveRowCell onremove={() => removeRow(index)} />
						</div>
					</header>
					<div class="card-grid">
						<Field label="Qty" for={`ing-qty-${index}`}>
							<TextField
								id={`ing-qty-${index}`}
								size="sm"
								inputmode="decimal"
								value={row.quantity == null ? "" : String(row.quantity)}
								oninput={(e) => {
									const raw = (e.currentTarget as HTMLInputElement).value;
									const next = parseQtyInput(raw);
									patchIndex(index, {
										quantity: next === false ? raw : next,
									});
								}}
							/>
						</Field>
						<Field label="Unit" for={`ing-unit-${index}`}>
							<NativeSelect
								id={`ing-unit-${index}`}
								size="sm"
								value={row.unit || "ml"}
								options={unitOptions}
								onchange={(e) => patchIndex(index, { unit: e.currentTarget.value })}
							/>
						</Field>
						<Field label="ABV" for={`ing-abv-${index}`}>
							<TextField
								id={`ing-abv-${index}`}
								size="sm"
								inputmode="decimal"
								disabled={Boolean(row.inventoryId)}
								value={row.displayAbv || ""}
								oninput={(e) =>
									patchIndex(index, {
										abv: (e.currentTarget as HTMLInputElement).value,
									})}
							/>
						</Field>
						<Field label="Line cost" for={`ing-cost-${index}`}>
							<p
								class="cost"
								class:muted={row.estimated}
								id={`ing-cost-${index}`}
								title={row.costHint || undefined}
							>
								{row.costLabel}
							</p>
						</Field>
					</div>
					<Field label="Note" for={`ing-note-${index}`}>
						<TextField
							id={`ing-note-${index}`}
							size="sm"
							placeholder="Optional"
							value={row.note || ""}
							oninput={(e) =>
								patchIndex(index, {
									note: (e.currentTarget as HTMLInputElement).value,
								})}
						/>
					</Field>
				</article>
			{/each}
		</div>
	{:else}
		<div class="host">
			<DataGrid
				rowData={rows}
				{columnDefs}
				getRowId={(row) => row._key}
				domLayout="autoHeight"
				gridOptions={{
					suppressCellFocus: false,
					singleClickEdit: true,
					stopEditingWhenCellsLoseFocus: true,
					enableBrowserTooltips: true,
				}}
			/>
		</div>
	{/if}
</div>

<Dialog
	open={editIndex != null}
	title="Change ingredient"
	onclose={closeEdit}
>
	{#if editing}
		<IngredientPicker
			bind:inventory
			mode="edit"
			active={editIndex != null}
			initial={{
				quantity: editing.quantity == null ? "" : String(editing.quantity),
				unit: editing.unit || "ml",
				name: editing.name || "",
			}}
			onpick={applyEdit}
		/>
	{/if}
	{#snippet footer()}
		<Button variant="outline" size="sm" type="button" onclick={closeEdit}>
			Cancel
		</Button>
	{/snippet}
</Dialog>

<style>
	.grid-wrap {
		display: grid;
		gap: 0.55rem;
	}

	.empty {
		margin: 0;
		padding: 0.85rem 0.2rem;
		font-size: 0.8125rem;
		color: var(--muted-foreground);
	}

	.host {
		width: 100%;
		min-width: 0;
		min-height: 0;
	}

	.cards {
		display: grid;
		gap: 0.65rem;
	}

	.card {
		display: grid;
		gap: 0.55rem;
		padding: 0.75rem 0.8rem 0.85rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--sunken);
	}

	.card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		min-width: 0;
	}

	.card-name {
		min-width: 0;
		font-weight: 600;
		line-height: 1.3;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.card-tools {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		flex-shrink: 0;
	}

	.card-action {
		margin: 0;
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--muted-foreground);
		text-decoration: none;
		cursor: pointer;
	}

	.card-action:hover {
		color: var(--primary);
	}

	.card-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.55rem 0.65rem;
	}

	.cost {
		display: flex;
		align-items: center;
		min-height: var(--control-h-sm);
		margin: 0;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: var(--text);
	}

	.cost.muted {
		color: var(--muted-foreground);
	}
</style>
