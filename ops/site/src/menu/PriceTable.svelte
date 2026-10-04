<script lang="ts">
	/**
	 * The Pricing tab's prices, on the data grid: one row per size the drink
	 * sells in, with its name, size, price, till SKU and what it costs to pour
	 * against the house target. Clicking a row opens the same editor
	 * everywhere: a dialog on desktop, a bottom sheet on phones. The first
	 * row is the main price.
	 */
	import type { ColDef, ICellRendererParams } from "ag-grid-community";
	import { Button, DataGrid, Dialog, Field, MoneyField, TextField } from "../ui";
	import { svelteCell } from "../ui/grid";
	import { Icon } from "../app/shell";
	import { formatGbp } from "../app/money";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../ui/viewport.svelte";
	import { formatPourPercent, marginTone, type PriceRowReading, type RecipePriceAnalysis } from "./cost";
	import { priceFieldId } from "./item-validate";
	import type { PriceRow } from "./prices.js";
	import FieldCell from "./cells/FieldCell.svelte";
	import PriceRowActionsCell from "./cells/PriceRowActionsCell.svelte";

	let {
		rows,
		price,
		error = () => "",
		onchange,
	}: {
		rows: PriceRow[];
		/** Recipe cost for the Pour column; null when nothing can be costed yet. */
		price: RecipePriceAnalysis | null;
		/** The message for a field id (f-price-0, f-price-name-1). */
		error?: (id: string) => string;
		/** `field` names the edit so typing in one cell is one undo step. */
		onchange: (next: PriceRow[], field: string) => void;
	} = $props();

	type GridRow = PriceRow & {
		_key: string;
		_index: number;
		_label: string;
		_pour: string;
		_cost: string;
		_tone: string;
		_suggested: string;
		_nameError: string;
		_priceError: string;
	};

	const phone = mediaMatches(SHELL_MOBILE_QUERY);
	let sheetIndex = $state<number | null>(null);

	function reading(index: number): PriceRowReading | null {
		return price?.priceRows?.[index] ?? null;
	}

	function label(row: PriceRow, index: number): string {
		return row.name?.trim() || (index === 0 ? "main price" : `price ${index + 1}`);
	}

	function costText(read: PriceRowReading | null): string {
		const cost = read?.serve?.drinkCost;
		if (cost == null) return "";
		return `${price?.hasEstimates ? "~" : ""}${formatGbp(cost)}`;
	}

	function pourText(read: PriceRowReading | null): string {
		const serve = read?.serve;
		if (!serve || serve.drinkCost == null) return "n/a";
		return serve.pourCost != null ? formatPourPercent(serve.pourCost) : "No price";
	}

	function pourTone(read: PriceRowReading | null): string {
		const serve = read?.serve;
		if (!serve || serve.pourCost == null) return "muted";
		return marginTone(serve.margin, serve.pourCost, price?.targetPourCost);
	}

	const gridRows = $derived.by((): GridRow[] =>
		rows.map((row, index) => {
			const read = reading(index);
			const suggested = read?.serve?.suggestedPrice;
			return {
				...row,
				_key: `price-${index}`,
				_index: index,
				_label: label(row, index),
				_pour: pourText(read),
				_cost: costText(read),
				_tone: pourTone(read),
				_suggested: suggested == null ? "" : suggested.toFixed(2),
				_nameError: error(priceFieldId("name", index)),
				_priceError: error(priceFieldId("price", index)),
			};
		}),
	);

	function update(index: number, key: keyof PriceRow, value: string) {
		const current = rows[index];
		if (!current || (current[key] || "") === value) return;
		onchange(
			rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
			`prices:${key}:${index}`,
		);
	}

	function move(index: number, by: -1 | 1) {
		const to = index + by;
		if (to < 0 || to >= rows.length) return;
		const next = [...rows];
		[next[index], next[to]] = [next[to], next[index]];
		onchange(next, "prices:order");
	}

	function remove(index: number) {
		if (index === 0) return;
		onchange(rows.filter((_, i) => i !== index), "prices:remove");
	}

	function fieldCell(key: "name" | "size" | "price" | "sku") {
		return svelteCell(FieldCell, (params: ICellRendererParams<GridRow>) => {
			const row = params.data;
			if (!row) return {};
			if (key === "price") {
				return {
					id: priceFieldId("price", row._index),
					text: row.price ? formatGbp(Number(row.price)) || `£${row.price}` : "",
					placeholder: row._suggested ? `£${row._suggested}` : "£0.00",
					error: row._priceError,
				};
			}
			return {
				id: key === "name" ? priceFieldId("name", row._index) : undefined,
				text: row[key] || "",
				placeholder: key === "name" ? (row._index === 0 ? "Single" : "Name it") : key === "size" ? "e.g. 25 ml" : "",
				error: key === "name" ? row._nameError : "",
				mono: key === "sku",
			};
		});
	}

	const columnDefs = $derived.by((): ColDef<GridRow>[] => [
		{
			headerName: "Name",
			field: "name",
			editable: false,
			flex: 1.4,
			minWidth: 140,
			cellRenderer: fieldCell("name"),
		},
		{
			headerName: "Size",
			field: "size",
			editable: false,
			flex: 1,
			minWidth: 110,
			cellRenderer: fieldCell("size"),
		},
		{
			headerName: "Price",
			field: "price",
			editable: false,
			width: 120,
			type: "num",
			cellDataType: "text",
			cellRenderer: fieldCell("price"),
			tooltipValueGetter: (params) =>
				params.data?._suggested ? `£${params.data._suggested} meets the pour target` : undefined,
		},
		{
			headerName: "Till SKU",
			field: "sku",
			editable: false,
			width: 140,
			cellRenderer: fieldCell("sku"),
		},
		{
			headerName: "Pour",
			colId: "pour",
			width: 130,
			type: "num",
			editable: false,
			valueGetter: (params) => params.data?._pour || "",
			cellClass: (params) => `num ag-right-aligned-cell tnum ${params.data?._tone || "muted"}`,
			valueFormatter: (params) =>
				params.data?._cost ? `${params.data._pour}  ·  ${params.data._cost}` : params.data?._pour || "",
			tooltipValueGetter: (params) =>
				params.data?._pour === "n/a" ? "Give it a size in ml to cost it" : "Pour cost, then what it costs to make",
		},
		{
			headerName: "",
			colId: "actions",
			width: 120,
			flex: 0,
			sortable: false,
			filter: false,
			editable: false,
			resizable: false,
			suppressMovable: true,
			cellClass: "row-action-cell",
			cellRenderer: svelteCell(PriceRowActionsCell, (params: ICellRendererParams<GridRow>) => ({
				label: params.data?._label || "price",
				first: params.data?._index === 0,
				last: params.data?._index === rows.length - 1,
				onmove: (by: -1 | 1) => params.data && move(params.data._index, by),
				onremove: () => params.data && remove(params.data._index),
			})),
		},
	]);

	const sheetRow = $derived(sheetIndex != null ? gridRows[sheetIndex] ?? null : null);
</script>

{#if phone.matches}
	<ul class="lines">
		{#each gridRows as row (row._key)}
			<li>
				<button
					type="button"
					class="line"
					class:invalid={Boolean(row._nameError || row._priceError)}
					onclick={() => (sheetIndex = row._index)}
				>
					<span class="line-name">
						<span class="line-title">{row.name || "Unnamed"}</span>
						{#if row.size}<span class="line-sub">{row.size}</span>{/if}
					</span>
					<span class="line-price tnum">{row.price ? formatGbp(Number(row.price)) : "No price"}</span>
					<span class="line-pour tnum {row._tone}">{row._pour}</span>
					<span class="line-chevron" aria-hidden="true"><Icon name="chevron-right" size={16} /></span>
				</button>
			</li>
		{/each}
	</ul>
{:else}
	<div class="host">
		<DataGrid
			rowData={gridRows}
			{columnDefs}
			getRowId={(row) => row._key}
			domLayout="autoHeight"
			onRowClicked={(row) => (sheetIndex = row._index)}
			gridOptions={{
				suppressCellFocus: false,
				enableBrowserTooltips: true,
			}}
		/>
	</div>
{/if}

<Dialog open={sheetRow != null} sheet={phone.matches} title={sheetRow?.name || "Price"} onclose={() => (sheetIndex = null)}>
	{#if sheetRow}
		{@const index = sheetRow._index}
		<div class="sheet-body">
			<div class="sheet-row">
				<Field label="Name" for={priceFieldId("name", index)} required error={sheetRow._nameError}>
					<TextField
						id={priceFieldId("name", index)}
						value={sheetRow.name || ""}
						oninput={(e) => update(index, "name", (e.currentTarget as HTMLInputElement).value)}
					/>
				</Field>
				<Field label="Size" for={priceFieldId("size", index)} optional>
					<TextField
						id={priceFieldId("size", index)}
						placeholder="e.g. 25 ml"
						value={sheetRow.size || ""}
						oninput={(e) => update(index, "size", (e.currentTarget as HTMLInputElement).value)}
					/>
				</Field>
			</div>
			<div class="sheet-row">
				<Field
					label="Price"
					for={priceFieldId("price", index)}
					required
					error={sheetRow._priceError}
				>
					<MoneyField
						id={priceFieldId("price", index)}
						value={sheetRow.price || ""}
						placeholder={sheetRow._suggested ? `${sheetRow._suggested} meets the pour target` : "0.00"}
						oninput={(e) => update(index, "price", (e.currentTarget as HTMLInputElement).value)}
						oncommit={(next) => update(index, "price", next)}
					/>
				</Field>
				<Field label="Till SKU" for={priceFieldId("sku", index)} optional help="Prices">
					<TextField
						id={priceFieldId("sku", index)}
						mono
						value={sheetRow.sku || ""}
						oninput={(e) => update(index, "sku", (e.currentTarget as HTMLInputElement).value)}
					/>
				</Field>
			</div>
			<div class="sheet-actions">
				<Button
					variant="outline"
					type="button"
					disabled={index === 0}
					reason="Already first"
					onclick={() => {
						move(index, -1);
						sheetIndex = index - 1;
					}}
				>
					{#snippet icon()}<Icon name="chevron-up" size={16} />{/snippet}
					Move up
				</Button>
				<Button
					variant="outline"
					type="button"
					disabled={index === rows.length - 1}
					reason="Already last"
					onclick={() => {
						move(index, 1);
						sheetIndex = index + 1;
					}}
				>
					{#snippet icon()}<Icon name="chevron-down" size={16} />{/snippet}
					Move down
				</Button>
				<Button
					variant="ghost"
					type="button"
					class="remove-line"
					disabled={index === 0}
					reason="A drink needs one price"
					onclick={() => {
						sheetIndex = null;
						remove(index);
					}}
				>
					{#snippet icon()}<Icon name="trash" size={16} />{/snippet}
					Remove
				</Button>
			</div>
		</div>
	{/if}
	{#snippet footer()}
		<Button variant="primary" size="sm" type="button" onclick={() => (sheetIndex = null)}>
			{#snippet icon()}<Icon name="check" size={14} />{/snippet}
			Done
		</Button>
	{/snippet}
</Dialog>

<style>
	/* The grid sits on the editor's card: the card's own surface, no darker box. */
	.host {
		--grid-bg: transparent;
		--grid-head-bg: transparent;
		width: 100%;
		min-width: 0;
	}

	/* Only as tall as its rows: AG Grid gives auto-height grids a floor otherwise. */
	.host :global(:is(.ag-center-cols-viewport, .ag-center-cols-container, .ag-body-viewport, .ag-center-cols-clipper)) {
		min-height: 0 !important;
	}

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
		grid-template-columns: minmax(0, 1fr) auto auto auto;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		min-height: 3rem;
		margin: 0;
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
		border: 0;
		background: transparent;
		color: var(--fg);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.line.invalid {
		box-shadow: inset 3px 0 0 var(--danger);
	}

	.line:active {
		background: var(--surface-3);
	}

	.line:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: -2px;
	}

	.line-name {
		display: grid;
		min-width: 0;
	}

	.line-title {
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.line-sub {
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}

	.line-price,
	.line-pour {
		font-size: var(--text-sm);
		white-space: nowrap;
	}

	.line-chevron {
		display: inline-flex;
		color: var(--fg-subtle);
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
	}
</style>
