<script lang="ts">
	/**
	 * Where a drink appears: one row per placement, as many per channel as
	 * wanted: a grid on desktop, a compact list on phones. Clicking a row opens
	 * the same editor everywhere: a dialog on desktop, a bottom sheet on phones.
	 * Rows are keyed by position, since two rows can name the same place.
	 */
	import type { ColDef, ICellRendererParams } from "ag-grid-community";
	import { Icon } from "../app/shell";
	import { Badge, Button, DataGrid, Dialog, Field, NativeSelect, TextField } from "../ui";
	import { ROW_ACTION_COLUMN, svelteCell } from "../ui/grid";
	import type { SelectOption } from "../ui/types";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../ui/viewport.svelte";
	import type { MenuPlacement, PosMenu } from "./types";
	import { parsePosScreenInput } from "../inventory/lightspeed-stock.js";
	import { isRepeatPlacement } from "./placement-add";
	import PlacementChannelCell from "./cells/PlacementChannelCell.svelte";
	import RemoveRowCell from "./cells/RemoveRowCell.svelte";

	type PlacementRow = {
		_key: string;
		index: number;
		channel: MenuPlacement["channel"];
		label: string;
		/** Chapter id (Print, Digital) or screen path (POS). */
		location: string;
		locationLabel: string;
		repeat: boolean;
	};

	let {
		menus = [],
		placements = [],
		sectionOptions = [],
		screenSuggestions = [],
		drinkName = "",
		posName = "",
		onposname,
		onchange,
	}: {
		menus?: PosMenu[];
		placements?: MenuPlacement[];
		sectionOptions?: SelectOption[];
		screenSuggestions?: string[];
		/** Shown on Print and Digital, which always use the drink's name. */
		drinkName?: string;
		/** The till button name: one override shared by every POS row. */
		posName?: string;
		onposname: (next: string) => void;
		onchange: (next: MenuPlacement[]) => void;
	} = $props();

	const phone = mediaMatches(SHELL_MOBILE_QUERY);

	/** The placement open in the phone sheet. */
	let sheetIndex = $state<number | null>(null);

	const sectionLabels = $derived(
		new Map(sectionOptions.map((option) => [String(option.value), option.label])),
	);

	/** Known till screens, plus any a row already uses. */
	const screenPaths = $derived.by((): string[] => {
		const out: string[] = [];
		const seen = new Set<string>();
		const add = (raw: unknown) => {
			const path = parsePosScreenInput(raw);
			if (!path || seen.has(path.toLowerCase())) return;
			seen.add(path.toLowerCase());
			out.push(path);
		};
		for (const path of screenSuggestions || []) add(path);
		for (const row of placements || []) if (row.channel === "pos") add(row.posScreen);
		return out;
	});

	function channelLabel(row: MenuPlacement): string {
		if (row.channel === "print") return "Print";
		if (row.channel === "digital") return "Digital";
		const name =
			row.posMenuName ||
			(menus || []).find((menu) => String(menu.id) === String(row.posMenuId))?.name ||
			"";
		return name ? `POS · ${name}` : "POS";
	}

	function sectionLabel(id: string): string {
		if (!id) return "Choose chapter…";
		return sectionLabels.get(id) || "Unknown chapter";
	}

	const rows = $derived.by((): PlacementRow[] =>
		(placements || []).map((row, index) => {
			const location =
				row.channel === "pos"
					? parsePosScreenInput(row.posScreen)
					: String(row.sectionId || "");
			return {
				_key: `placement-${index}`,
				index,
				channel: row.channel,
				label: channelLabel(row),
				location,
				locationLabel:
					row.channel === "pos" ? location || "Choose screen…" : sectionLabel(location),
				repeat: isRepeatPlacement(placements || [], index),
			};
		}),
	);

	const sheetRow = $derived(sheetIndex != null ? rows[sheetIndex] ?? null : null);

	const sheetLocationOptions = $derived.by((): SelectOption[] => {
		if (!sheetRow) return [];
		if (sheetRow.channel === "pos") {
			return screenPaths.map((path) => ({ value: path, label: path }));
		}
		return sectionOptions;
	});

	function patchIndex(index: number, patch: Partial<MenuPlacement>) {
		onchange((placements || []).map((row, i) => (i === index ? { ...row, ...patch } : row)));
	}

	function setLocation(index: number, raw: unknown) {
		const row = (placements || [])[index];
		if (!row) return false;
		if (row.channel === "pos") {
			const path = parsePosScreenInput(raw);
			if (!path) return false;
			patchIndex(index, { posScreen: path });
			return true;
		}
		const sectionId = String(raw ?? "").trim();
		if (!sectionId) return false;
		patchIndex(index, { sectionId, sectionTitle: sectionLabels.get(sectionId) });
		return true;
	}

	function removeRow(index: number) {
		onchange((placements || []).filter((_, i) => i !== index));
	}

	const columnDefs = $derived.by((): ColDef<PlacementRow>[] => [
		{
			headerName: "Channel",
			colId: "channel",
			editable: false,
			flex: 1,
			minWidth: 160,
			valueGetter: (params) => params.data?.label || "",
			cellRenderer: svelteCell(
				PlacementChannelCell,
				(params: ICellRendererParams<PlacementRow>) => ({
					label: params.data?.label || "",
					repeat: Boolean(params.data?.repeat),
				}),
			),
		},
		{
			headerName: "Location",
			colId: "location",
			editable: false,
			flex: 1.6,
			minWidth: 200,
			cellDataType: "text",
			valueGetter: (params) => params.data?.location || "",
			valueFormatter: (params) => {
				const value = String(params.value ?? "");
				const channel = params.data?.channel;
				if (channel === "print" || channel === "digital") return sectionLabel(value);
				if (channel === "pos") return value || "Choose screen…";
				return sectionLabels.get(value) ?? value;
			},
		},
		{
			headerName: "Name on it",
			colId: "name",
			flex: 1.4,
			minWidth: 180,
			cellDataType: "text",
			editable: false,
			valueGetter: (params) => (params.data?.channel === "pos" ? posName : drinkName),
			valueFormatter: (params) =>
				String(params.value || "") || drinkName || "The drink's name",
			cellClass: (params) =>
				params.data?.channel !== "pos" || !posName ? "muted" : "",
			tooltipValueGetter: (params) =>
				params.data?.channel === "pos"
					? "The till button name, shared by every POS row"
					: "Print and digital menus use the drink's name",
		},
		{
			...ROW_ACTION_COLUMN,
			colId: "remove",
			cellRenderer: svelteCell(
				RemoveRowCell,
				(params: ICellRendererParams<PlacementRow>) => ({
					label: `Remove ${params.data?.label || "this placement"}`,
					onremove: () => {
						if (params.data) removeRow(params.data.index);
					},
				}),
			),
		},
	]);
</script>

<div class="panel">
	{#if rows.length === 0}
		<p class="hint">Not on any menu yet. Use Add placement to put it on Print, Digital or a POS menu.</p>
	{:else if phone.matches}
		<!-- Phones: one line per placement; tap it to edit in a sheet. -->
		<ul class="lines">
			{#each rows as row (row._key)}
				<li>
					<button type="button" class="line" onclick={() => (sheetIndex = row.index)}>
						<span class="line-main">
							<span class="line-title">
								{row.label}
								{#if row.repeat}<Badge tone="warning" label="Repeat" />{/if}
							</span>
							<span class="line-sub">{row.locationLabel}</span>
						</span>
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
				onRowClicked={(row) => (sheetIndex = row.index)}
				gridOptions={{
					suppressCellFocus: false,
					enableBrowserTooltips: true,
				}}
			/>
		</div>
	{/if}

	{#if rows.some((row) => row.channel === "print" || row.channel === "digital") && !rows.some((row) => row.channel === "pos")}
		<p class="hint warn">
			Guest menus need a POS row so the till can sell this drink.
		</p>
	{/if}
</div>

<Dialog
	open={sheetRow != null}
	sheet={phone.matches}
	title={sheetRow?.label || "Placement"}
	onclose={() => (sheetIndex = null)}
>
	{#if sheetRow}
		{@const index = sheetRow.index}
		<div class="sheet-body">
			{#if sheetRow.repeat}
				<p class="hint warn">Same as a row above. Save keeps one; change the {sheetRow.channel === "pos" ? "screen" : "chapter"} to keep both.</p>
			{/if}
			{#if sheetRow.channel === "pos"}
				<Field label="Till screen" for="placement-sheet-location">
					<NativeSelect
						id="placement-sheet-location"
						value={sheetRow.location}
						options={[{ value: "", label: "Choose screen…" }, ...sheetLocationOptions]}
						onchange={(e) => setLocation(index, e.currentTarget.value)}
					/>
				</Field>
				<Field label="Name on the till" for="placement-sheet-name" optional help="Name on it">
					<TextField
						id="placement-sheet-name"
						value={posName}
						placeholder={drinkName || "Same as the drink"}
						oninput={(e) => onposname((e.currentTarget as HTMLInputElement).value)}
					/>
				</Field>
			{:else}
				<Field label="Chapter" for="placement-sheet-location">
					<NativeSelect
						id="placement-sheet-location"
						value={sheetRow.location}
						options={sheetLocationOptions}
						onchange={(e) => setLocation(index, e.currentTarget.value)}
					/>
				</Field>
				<Field label="Name on it" for="placement-sheet-name" help="Name on it">
					<p class="inherited" id="placement-sheet-name">{drinkName || "The drink's name"}</p>
				</Field>
			{/if}
			<div class="sheet-actions">
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
	.panel {
		display: grid;
		gap: var(--space-3);
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
	}

	/* Print and Digital carry the drink's name; a POS row with no override shows it too. */
	.host :global(.ag-cell.muted) {
		color: var(--muted-foreground);
	}

	.hint {
		margin: 0;
		font-size: var(--text-xs);
		line-height: 1.4;
		color: var(--muted-foreground);
	}

	.hint.warn {
		color: var(--warning, var(--primary));
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
		grid-template-columns: minmax(0, 1fr) auto;
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

	.line-main {
		display: grid;
		min-width: 0;
	}

	.line-title,
	.line-sub {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.line-title {
		font-weight: 500;
	}

	.line-title {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.line-sub {
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

	.inherited {
		display: flex;
		align-items: center;
		min-height: var(--control-h-sm);
		margin: 0;
		color: var(--muted-foreground);
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
</style>
