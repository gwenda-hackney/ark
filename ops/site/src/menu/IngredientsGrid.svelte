<script lang="ts">
	/**
	 * Editable recipe lines. On desktop qty / unit / note edit inline in the
	 * grid; on phones each line is one compact row that opens a sheet.
	 * Click the ingredient name to change stock (dialog). Add via parent +.
	 * Linked stock ABV is resolved from inventory (read-only in the grid).
	 * Line cost comes from the same pour-cost math as analysis.
	 */
	import type { ColDef, ICellRendererParams, ValueSetterParams } from "ag-grid-community";
	import { Icon } from "../app/shell";
	import { Button, DataGrid, Dialog, Field, NativeSelect, NumberField, TextField } from "../ui";
	import { ROW_ACTION_COLUMN, svelteCell } from "../ui/grid";
	import { inventoryItemPath, navigate } from "../app/nav";
	import { inventoryAbvById, resolveIngredientAbv } from "./abv";
	import { costIngredientLine } from "./cost";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../ui/viewport.svelte";
	import { formatGbp } from "../app/money";
	import { type InventoryItem } from "../inventory/types";
	import { UNITS, type Ingredient } from "./types";
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
	/** The line open in the phone sheet. */
	let sheetIndex = $state<number | null>(null);

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

	const sheetRow = $derived(sheetIndex != null ? rows[sheetIndex] ?? null : null);

	const editing = $derived(
		editIndex != null ? ingredients[editIndex] ?? null : null,
	);

	/** "50 ml", "1 each", or a dash before a quantity is set. */
	function amountLabel(row: IngRow): string {
		const qty = row.quantity == null || row.quantity === "" ? "" : String(row.quantity);
		if (!qty) return "—";
		return `${qty} ${row.unit || "ml"}`.trim();
	}

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
			...ROW_ACTION_COLUMN,
			colId: "remove",
			cellRenderer: svelteCell(
				RemoveRowCell,
				(params: ICellRendererParams<IngRow>) => ({
					label: `Remove ${params.data?.name || "this line"}`,
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
		<!-- Phones: one line per ingredient; tap it to edit in a sheet. -->
		<ul class="lines">
			{#each rows as row, index (row._key)}
				<li>
					<button type="button" class="line" onclick={() => (sheetIndex = index)}>
						<span class="line-qty">{amountLabel(row)}</span>
						<span class="line-name">
							<span class="line-title">{row.name || "Untitled"}</span>
							{#if row.note}<span class="line-note">{row.note}</span>{/if}
						</span>
						<span class="line-cost" class:muted={row.estimated}>{row.costLabel}</span>
						<span class="line-chevron" aria-hidden="true"><Icon name="chevron-right" size={16} /></span>
					</button>
				</li>
			{/each}
		</ul>
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
			{#snippet icon()}<Icon name="close" size={14} />{/snippet}
			Cancel
		</Button>
	{/snippet}
</Dialog>

<Dialog
	open={sheetRow != null}
	sheet
	title={sheetRow?.name || "Ingredient"}
	onclose={() => (sheetIndex = null)}
>
	{#if sheetRow && sheetIndex != null}
		{@const index = sheetIndex}
		<div class="sheet-body">
			<div class="sheet-row">
				<Field label="How much" for="ing-sheet-qty">
					<NumberField
						id="ing-sheet-qty"
						min={0}
						noun="a quantity"
						value={sheetRow.quantity == null ? "" : String(sheetRow.quantity)}
						oninput={(e) => {
							const raw = (e.currentTarget as HTMLInputElement).value;
							const next = parseQtyInput(raw);
							patchIndex(index, { quantity: next === false ? raw : next });
						}}
					/>
				</Field>
				<Field label="Unit" for="ing-sheet-unit">
					<NativeSelect
						id="ing-sheet-unit"
						value={sheetRow.unit || "ml"}
						options={unitOptions}
						onchange={(e) => patchIndex(index, { unit: e.currentTarget.value })}
					/>
				</Field>
			</div>
			<div class="sheet-row">
				<Field label="ABV" for="ing-sheet-abv" optional={!sheetRow.inventoryId} hint={sheetRow.inventoryId ? "From stock." : undefined}>
					<NumberField
						id="ing-sheet-abv"
						unit="%"
						min={0}
						max={100}
						decimals={1}
						noun="a percentage"
						disabled={Boolean(sheetRow.inventoryId)}
						value={String(sheetRow.displayAbv || "").replace(/%/g, "")}
						oninput={(e) => patchIndex(index, { abv: (e.currentTarget as HTMLInputElement).value })}
					/>
				</Field>
				<Field label="Line cost" for="ing-sheet-cost" hint={sheetRow.costHint || undefined}>
					<p class="cost" class:muted={sheetRow.estimated} id="ing-sheet-cost">{sheetRow.costLabel}</p>
				</Field>
			</div>
			<Field label="Note" for="ing-sheet-note" optional>
				<TextField
					id="ing-sheet-note"
					placeholder="Fresh, chilled, to top…"
					value={sheetRow.note || ""}
					oninput={(e) => patchIndex(index, { note: (e.currentTarget as HTMLInputElement).value })}
				/>
			</Field>
			<div class="sheet-actions">
				<Button variant="outline" type="button" onclick={() => { sheetIndex = null; openEdit(index); }}>
					{#snippet icon()}<Icon name="pen" size={16} />{/snippet}
					Change ingredient
				</Button>
				<Button
					variant="ghost"
					type="button"
					disabled={!sheetRow.href}
					reason={sheetRow.href ? undefined : "Not linked to a stock item"}
					onclick={() => { const href = sheetRow.href; if (!href) return; sheetIndex = null; navigate(href); }}
				>
					{#snippet icon()}<Icon name="external-link" size={16} />{/snippet}
					Open in stock
				</Button>
				<Button variant="ghost" type="button" class="remove-line" onclick={() => { sheetIndex = null; removeRow(index); }}>
					{#snippet icon()}<Icon name="trash" size={16} />{/snippet}
					Remove
				</Button>
			</div>
		</div>
	{/if}
	{#snippet footer()}
		<Button variant="primary" size="sm" type="button" onclick={() => (sheetIndex = null)}>{#snippet icon()}<Icon name="check" size={14} />{/snippet}Done</Button>
	{/snippet}
</Dialog>

<style>
	.grid-wrap {
		display: grid;
		gap: var(--space-2);
	}

	.empty {
		margin: 0;
		padding: var(--space-3) 0.2rem;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}

	/* Lives inside the editor card: the grid sits on the card surface. */
	.host {
		--grid-bg: transparent;
		--grid-head-bg: transparent;
		width: 100%;
		min-width: 0;
		min-height: 0;
	}

	/* The grid sits on the editor's card: the card's own surface, no darker box. */
	.host :global(.ag-root-wrapper) {
		--ag-background-color: var(--card);
		--ag-data-background-color: var(--card);
		--ag-header-background-color: var(--card);
	}

	.lines {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.lines li + li {
		border-top: 1px solid var(--border);
	}

	.line {
		display: grid;
		grid-template-columns: 4.5rem minmax(0, 1fr) auto auto;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		min-height: 3rem;
		margin: 0;
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
		border: 0;
		background: transparent;
		color: var(--foreground);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.line:active {
		background: var(--surface-3);
	}

	.line:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: -2px;
	}

	.line-qty,
	.line-cost {
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
		font-feature-settings: var(--font-features-num);
		white-space: nowrap;
	}

	.line-qty {
		color: var(--muted-foreground);
	}

	.line-cost.muted {
		color: var(--muted-foreground);
	}

	.line-name {
		display: grid;
		min-width: 0;
	}

	.line-title,
	.line-note {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.line-title {
		font-weight: 500;
	}

	.line-note {
		font-size: var(--text-xs);
		color: var(--muted-foreground);
	}

	.line-chevron {
		display: inline-flex;
		color: var(--subtle-foreground);
	}

	.sheet-body {
		display: grid;
		gap: var(--space-4);
	}

	.sheet-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
	}

	.sheet-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.sheet-actions :global(.remove-line) {
		margin-left: auto;
		color: var(--destructive);
	}

	.cost {
		display: flex;
		align-items: center;
		min-height: var(--control-h-sm);
		margin: 0;
		font-variant-numeric: tabular-nums;
		font-feature-settings: var(--font-features-num);
		font-size: var(--text-base);
	}

	.cost.muted {
		color: var(--muted-foreground);
	}
</style>
