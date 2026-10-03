<script lang="ts">
	/**
	 * Menu items in one AG Grid, grouped by section via full-width headers.
	 * Rows are not click-to-open: that fights copying. Open via the name,
	 * the trailing chevron, or a double-click that is not a text selection.
	 * On a phone the grid is replaced by a sectioned compact list.
	 */
	import type { ColDef, ICellRendererParams } from "ag-grid-community";
	import { untrack } from "svelte";
	import { Button, DataGrid, SearchField } from "../ui";
	import {
		hasRangeSelection,
		keepFullWidthGroupsTogether,
		svelteCell,
	} from "../ui/grid";
	import {
		buildMenuListRows,
		compareNullable,
		type MenuListItem,
		type MenuListRow,
	} from "./menu-list";
	import type { InventoryItem } from "../inventory/types";
	import type { MenuItem, MenuSection } from "./types";
	import { pourSettings } from "../config/settings.svelte";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../ui/viewport.svelte";
	import { Icon } from "../app/shell";
	import CompactMenuList from "./CompactMenuList.svelte";
	import HighlightCell from "./cells/HighlightCell.svelte";
	import IssuesCell from "./cells/IssuesCell.svelte";
	import NameCell from "./cells/NameCell.svelte";
	import PhotoCell from "./cells/PhotoCell.svelte";
	import PublishStatusCell from "./cells/PublishStatusCell.svelte";
	import PosStatusCell from "./cells/PosStatusCell.svelte";
	import PosMenuCell from "./cells/PosMenuCell.svelte";
	import PosScreenCell from "./cells/PosScreenCell.svelte";
	import GuestMenuCell from "./cells/GuestMenuCell.svelte";
	import SectionGroupCell from "./cells/SectionGroupCell.svelte";
	import ViewDetailsCell from "./cells/ViewDetailsCell.svelte";

	type GridRow = MenuListRow;

	let {
		sections,
		inventory = [] as InventoryItem[],
		query = $bindable(""),
		selectedId = null,
		onview,
		onnew,
	}: {
		sections: MenuSection[];
		inventory?: InventoryItem[];
		query?: string;
		selectedId?: string | null;
		onview: (item: MenuItem, tab?: string) => void;
		onnew?: () => void;
	} = $props();

	const phone = mediaMatches(SHELL_MOBILE_QUERY);
	const q = $derived(query.trim().toLowerCase());
	const needle = $derived(query.trim());

	const rowData = $derived(
		buildMenuListRows({
			sections,
			inventory,
			query,
			targets: pourSettings.targets,
		}),
	);

	const totalCount = $derived(
		rowData.filter((row): row is MenuListItem => row._kind === "item").length,
	);

	const columnDefs = $derived.by((): ColDef<GridRow>[] => {
		const search = needle;
		const view = untrack(() => onview);
		return [
			{
				headerName: "",
				colId: "photo",
				width: 48,
				minWidth: 40,
				flex: 0,
				sortable: false,
				cellClass: "photo-cell",
				cellRenderer: svelteCell(PhotoCell, (params: ICellRendererParams<GridRow>) => ({
					url:
						params.data?._kind === "item"
							? params.data.image?.asset?.url || ""
							: "",
					alt: params.data?._kind === "item" ? params.data.name || "" : "",
				})),
			},
			{
				headerName: "Name",
				field: "name",
				minWidth: 160,
				flex: 1.4,
				cellClass: "name-cell",
				valueGetter: (p) =>
					p.data?._kind === "item" ? p.data.name || "Untitled" : "",
				cellRenderer: svelteCell(
					NameCell,
					(params: ICellRendererParams<GridRow>) => ({
						item: params.data?._kind === "item" ? params.data : null,
						query: search,
						hint:
							params.data?._kind === "item"
								? params.data._matchHint || null
								: null,
						onview: view,
					}),
				),
			},
			{
				headerName: "Kind",
				field: "_typeLabel",
				width: 100,
				minWidth: 84,
				flex: 0,
				valueGetter: (p) =>
					p.data?._kind === "item" ? p.data._typeLabel || "" : "",
				cellRenderer: svelteCell(
					HighlightCell,
					(params: ICellRendererParams<GridRow>) => ({
						text:
							params.data?._kind === "item" ? params.data._typeLabel || "" : "",
						query: search,
					}),
				),
			},
			{
				headerName: "Category",
				colId: "category",
				field: "_categoryLabel",
				minWidth: 110,
				width: 130,
				flex: 0.7,
				valueGetter: (p) =>
					p.data?._kind === "item" ? p.data._categoryLabel || "" : "",
				cellRenderer: svelteCell(
					HighlightCell,
					(params: ICellRendererParams<GridRow>) => ({
						text:
							params.data?._kind === "item"
								? params.data._categoryLabel || ""
								: "",
						query: search,
					}),
				),
			},
			{
				headerName: "Tasting note",
				field: "notes",
				minWidth: 140,
				flex: 1.4,
				valueGetter: (p) =>
					p.data?._kind === "item" ? p.data.notes || "" : "",
				cellRenderer: svelteCell(
					HighlightCell,
					(params: ICellRendererParams<GridRow>) => ({
						text:
							params.data?._kind === "item" ? params.data.notes || "" : "",
						query: search,
					}),
				),
			},
			{
				headerName: "Price",
				field: "_priceLabel",
				width: 120,
				minWidth: 88,
				flex: 0,
				type: "num",
				valueGetter: (p) =>
					p.data?._kind === "item" ? p.data._priceLabel || "" : "",
				cellRenderer: svelteCell(
					HighlightCell,
					(params: ICellRendererParams<GridRow>) => ({
						text:
							params.data?._kind === "item"
								? params.data._priceLabel || ""
								: "",
						query: search,
					}),
				),
			},
			{
				headerName: "Cost",
				colId: "cost",
				width: 96,
				minWidth: 80,
				flex: 0,
				type: "num",
				valueGetter: (p) =>
					p.data?._kind === "item" ? p.data._costLabel || "—" : "",
				comparator: (_a, _b, nodeA, nodeB) =>
					compareNullable(
						nodeA?.data?._kind === "item" ? nodeA.data._cost : null,
						nodeB?.data?._kind === "item" ? nodeB.data._cost : null,
					),
				cellClass: (p) =>
					p.data?._kind === "item" && p.data._cost != null
						? "num ag-right-aligned-cell"
						: "num muted ag-right-aligned-cell",
				tooltipValueGetter: (p) =>
					p.data?._kind === "item" ? p.data._costHint : undefined,
			},
			{
				headerName: "Pour",
				colId: "pour",
				width: 88,
				minWidth: 72,
				flex: 0,
				type: "num",
				valueGetter: (p) =>
					p.data?._kind === "item" ? p.data._pourLabel || "—" : "",
				comparator: (_a, _b, nodeA, nodeB) =>
					compareNullable(
						nodeA?.data?._kind === "item" ? nodeA.data._pourCost : null,
						nodeB?.data?._kind === "item" ? nodeB.data._pourCost : null,
					),
				cellClass: (p) => {
					if (p.data?._kind !== "item") {
						return "num ag-right-aligned-cell";
					}
					const tone = p.data._pourTone;
					if (tone === "up") return "num up ag-right-aligned-cell";
					if (tone === "loss") return "num loss ag-right-aligned-cell";
					if (tone === "down") return "num down ag-right-aligned-cell";
					return "num muted ag-right-aligned-cell";
				},
				tooltipValueGetter: (p) =>
					p.data?._kind === "item" ? p.data._pourHint : undefined,
			},
			{
				headerName: "ABV",
				colId: "abv",
				width: 72,
				minWidth: 64,
				flex: 0,
				type: "num",
				valueGetter: (p) =>
					p.data?._kind === "item" ? p.data._abvLabel || "—" : "",
				comparator: (_a, _b, nodeA, nodeB) =>
					compareNullable(
						nodeA?.data?._kind === "item" ? nodeA.data._abv : null,
						nodeB?.data?._kind === "item" ? nodeB.data._abv : null,
					),
				cellClass: (p) =>
					p.data?._kind === "item" && p.data._abv != null
						? "num ag-right-aligned-cell"
						: "num muted ag-right-aligned-cell",
			},
			{
				headerName: "Volume",
				colId: "volume",
				width: 96,
				minWidth: 80,
				flex: 0,
				type: "num",
				valueGetter: (p) =>
					p.data?._kind === "item" ? p.data._volumeLabel || "—" : "",
				comparator: (_a, _b, nodeA, nodeB) =>
					compareNullable(
						nodeA?.data?._kind === "item" ? nodeA.data._volumeMl : null,
						nodeB?.data?._kind === "item" ? nodeB.data._volumeMl : null,
					),
				cellClass: (p) =>
					p.data?._kind === "item" && p.data._volumeMl != null
						? "num ag-right-aligned-cell"
						: "num muted ag-right-aligned-cell",
			},
			{
				headerName: "Issues",
				colId: "issues",
				width: 88,
				minWidth: 72,
				flex: 0,
				type: "num",
				valueGetter: (p) =>
					p.data?._kind === "item" ? p.data._issueLabel || "—" : "",
				comparator: (_a, _b, nodeA, nodeB) =>
					compareNullable(
						nodeA?.data?._kind === "item" ? nodeA.data._issueCount : null,
						nodeB?.data?._kind === "item" ? nodeB.data._issueCount : null,
					),
				cellClass: "issue-cell",
				cellRenderer: svelteCell(
					IssuesCell,
					(params: ICellRendererParams<GridRow>) => ({
						item: params.data?._kind === "item" ? params.data : null,
						label:
							params.data?._kind === "item"
								? params.data._issueLabel || "—"
								: "—",
						tone:
							params.data?._kind === "item"
								? params.data._issueTone || ""
								: "",
						hint:
							params.data?._kind === "item"
								? params.data._issueHint || ""
								: "",
						onview: view,
					}),
				),
			},
			{
				headerName: "POS",
				colId: "pos",
				width: 120,
				minWidth: 96,
				flex: 0,
				valueGetter: (p) =>
					p.data?._kind === "item" ? p.data._posLabel || "—" : "",
				comparator: (_a, _b, nodeA, nodeB) => {
					const rank = (status: string | undefined) => {
						if (status === "missing") return 3;
						if (status === "mismatch") return 2;
						if (status === "matched") return 1;
						return 0;
					};
					const av =
						nodeA?.data?._kind === "item" ? rank(nodeA.data._posStatus) : 0;
					const bv =
						nodeB?.data?._kind === "item" ? rank(nodeB.data._posStatus) : 0;
					return av - bv;
				},
				cellRenderer: svelteCell(
					PosStatusCell,
					(params: ICellRendererParams<GridRow>) => ({
						status:
							params.data?._kind === "item"
								? params.data._posStatus || ""
								: "",
					}),
				),
			},
			{
				headerName: "POS menus",
				colId: "posMenus",
				minWidth: 120,
				width: 150,
				flex: 0.8,
				valueGetter: (p) =>
					p.data?._kind === "item" ? p.data._posMenusLabel || "None" : "",
				cellRenderer: svelteCell(
					PosMenuCell,
					(params: ICellRendererParams<GridRow>) => ({
						menus:
							params.data?._kind === "item"
								? params.data.posMenus || []
								: [],
					}),
				),
			},
			{
				headerName: "POS screens",
				colId: "posScreens",
				minWidth: 140,
				width: 180,
				flex: 1,
				valueGetter: (p) =>
					p.data?._kind === "item" ? p.data._posScreensLabel || "None" : "",
				cellRenderer: svelteCell(
					PosScreenCell,
					(params: ICellRendererParams<GridRow>) => ({
						label:
							params.data?._kind === "item"
								? params.data._posScreensLabel || ""
								: "",
					}),
				),
			},
			{
				headerName: "Guest",
				colId: "guest",
				width: 96,
				minWidth: 80,
				flex: 0,
				valueGetter: (p) =>
					p.data?._kind === "item" ? p.data._guestLabel || "Both" : "",
				comparator: (_a, _b, nodeA, nodeB) => {
					const rank = (placement: string | undefined) => {
						if (placement === "none") return 3;
						if (placement === "print" || placement === "digital") return 2;
						return 1;
					};
					const av =
						nodeA?.data?._kind === "item"
							? rank(nodeA.data._guestPlacement)
							: 0;
					const bv =
						nodeB?.data?._kind === "item"
							? rank(nodeB.data._guestPlacement)
							: 0;
					return av - bv;
				},
				cellRenderer: svelteCell(
					GuestMenuCell,
					(params: ICellRendererParams<GridRow>) => ({
						placement:
							params.data?._kind === "item"
								? params.data._guestPlacement || "both"
								: "both",
					}),
				),
			},
			{
				headerName: "Live",
				colId: "live",
				width: 64,
				minWidth: 52,
				flex: 0,
				cellClass: "status-cell",
				comparator: (_a, _b, nodeA, nodeB) => {
					const av =
						nodeA?.data?._kind === "item" ? nodeA.data._publishCount || 0 : 0;
					const bv =
						nodeB?.data?._kind === "item" ? nodeB.data._publishCount || 0 : 0;
					const ap =
						nodeA?.data?._kind === "item" && nodeA.data._publishPending ? 1 : 0;
					const bp =
						nodeB?.data?._kind === "item" && nodeB.data._publishPending ? 1 : 0;
					return ap - bp || av - bv;
				},
				valueGetter: (p) =>
					p.data?._kind === "item" && p.data._publishPending
						? p.data._publishCount || 1
						: 0,
				cellRenderer: svelteCell(
					PublishStatusCell,
					(params: ICellRendererParams<GridRow>) => ({
						publish:
							params.data?._kind === "item" ? params.data.publish : undefined,
					}),
				),
			},
			{
				headerName: "",
				colId: "actions",
				width: 56,
				minWidth: 48,
				flex: 0,
				sortable: false,
				cellClass: "action-cell",
				cellRenderer: svelteCell(
					ViewDetailsCell,
					(params: ICellRendererParams<GridRow>) => ({
						item: params.data?._kind === "item" ? params.data : null,
						onview: view,
					}),
				),
			},
		];
	});
</script>

<div class="wrap">
	<div class="toolbar">
		<SearchField
			bind:value={query}
			placeholder="Search name, ingredients, description"
			ariaLabel="Search drinks"
			width="min(100%, 26rem)"
			count={q ? totalCount : undefined}
		/>
		<div class="toolbar-end">
			<p class="meta">{totalCount} item{totalCount === 1 ? "" : "s"}</p>
			{#if onnew}
				<Button variant="outline" size="sm" type="button" onclick={onnew}>
					{#snippet icon()}
						<Icon name="plus" size={15} />
					{/snippet}
					New item
				</Button>
			{/if}
		</div>
	</div>

	{#if totalCount === 0}
		<p class="empty">
			{q ? "No drinks match that search." : "No menu items yet."}
		</p>
	{:else if phone.matches}
		<div class="compact-host">
			<CompactMenuList {query} {selectedId} rows={rowData} {onview} />
		</div>
	{:else}
		<div class="grid-host">
			<DataGrid
				{rowData}
				{columnDefs}
				scrollKey="menu-list"
				context={{ selectedId }}
				getRowId={(row) =>
					row._kind === "group"
						? row._id
						: String(row._id || row.name || "")}
				domLayout="normal"
				gridOptions={{
					suppressCellFocus: true,
					suppressRowClickSelection: true,
					suppressScrollOnNewData: true,
					enableBrowserTooltips: true,
					postSortRows: (params) =>
						keepFullWidthGroupsTogether(params.nodes),
					isFullWidthRow: (params) => params.rowNode.data?._kind === "group",
					fullWidthCellRenderer: svelteCell(
						SectionGroupCell,
						(params: ICellRendererParams<GridRow>) => ({
							title:
								params.data?._kind === "group" ? params.data.title : "",
							subtitle:
								params.data?._kind === "group"
									? params.data.subtitle
									: undefined,
							count:
								params.data?._kind === "group" ? params.data.count : 0,
						}),
					),
					getRowHeight: (params) => {
						if (params.data?._kind === "group") return 48;
						if (params.data?._kind === "item" && params.data._matchHint) {
							return 58;
						}
						return 42;
					},
					getRowClass: (params) => {
						const selected =
							(params.context as { selectedId?: string | null } | null)
								?.selectedId ?? null;
						if (params.data?._kind === "group") return "row-group";
						if (params.data?._kind === "item" && params.data._id === selected) {
							return "row-selected";
						}
						return undefined;
					},
					onRowDoubleClicked: (event) => {
						if (hasRangeSelection()) return;
						if (event.data?._kind === "item") onview(event.data);
					},
				}}
			/>
		</div>
	{/if}
</div>

<style>
	.wrap {
		display: flex;
		flex-direction: column;
		gap: 0;
		min-height: 0;
		height: 100%;
		background: var(--background);
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-shrink: 0;
		padding: 0.75rem var(--page-gutter);
		border-bottom: 1px solid var(--border);
	}

	.toolbar-end {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}

	.meta {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}

	.empty {
		margin: 2rem var(--page-gutter);
		text-align: center;
		color: var(--muted-foreground);
		font-size: var(--text-md);
	}

	.grid-host {
		flex: 1;
		min-width: 0;
		min-height: 0;
		padding: 0;
	}

	.grid-host :global(.ag-row) {
		cursor: default;
	}

	.grid-host :global(.action-cell),
	.grid-host :global(.action-cell .ag-cell-wrapper),
	.grid-host :global(.action-cell .ag-cell-value),
	.grid-host :global(.status-cell),
	.grid-host :global(.status-cell .ag-cell-wrapper),
	.grid-host :global(.status-cell .ag-cell-value) {
		justify-content: center;
		align-items: center;
		overflow: visible;
		height: 100%;
		line-height: 0;
	}

	.grid-host :global(.issue-cell),
	.grid-host :global(.issue-cell .ag-cell-wrapper),
	.grid-host :global(.issue-cell .ag-cell-value) {
		justify-content: flex-end;
		align-items: center;
	}

	.grid-host :global(.photo-cell) {
		overflow: visible;
		padding-left: var(--space-3);
		padding-right: var(--space-1);
	}

	.grid-host :global(.photo-cell .ag-cell-wrapper) {
		overflow: visible;
	}

	.grid-host :global(.row-selected) {
		background: var(--primary-wash) !important;
	}

	.grid-host :global(.row-group) {
		background: color-mix(in srgb, var(--foreground) 3.5%, var(--background)) !important;
	}

	.grid-host :global(.row-group .ag-cell),
	.grid-host :global(.ag-full-width-row) {
		border-bottom: 1px solid var(--border);
	}

	.compact-host {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		padding: 0 var(--page-gutter);
	}
</style>
