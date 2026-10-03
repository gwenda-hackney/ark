<script lang="ts">
	import { onMount } from "svelte";
	import type { ColDef, GridApi } from "ag-grid-community";
	import {
		BusyOverlay,
		Button,
		DataGrid,
		NativeSelect,
		PageHeader,
		PageHelp,
		SearchField,
	} from "../ui";
	import type { SelectOption } from "../ui/types";
	import { getInventory, getMenu, previewLightspeedCsv } from "../app/api";
	import { toast } from "../ui/toast.svelte";
	import type { InventoryItem } from "./types";
	import type { MenuItem, MenuSection, PosMenu } from "../menu/types";
	import {
		collectMenuItems,
		DEFAULT_LIGHTSPEED_MENU,
		LIGHTSPEED_COMBINED_IMPORT_HEADERS,
		LIVE_POS_MENU_NAME,
		expandMenuItemsForLightspeedExport,
		itemOnPosMenu,
		inventoryExclusiveForExport,
		lightspeedCombinedImportPreviewRows,
		lightspeedCombinedItemImportCsv,
		newlyAllocatedLightspeedSkus,
		posScreenPaths,
		storedLightspeedSku,
		withAllocatedLightspeedSkus,
		withInventoryExportIds,
	} from "./lightspeed-stock.js";
	import { EXPORT_HELP } from "./lightspeed-help";

	type GridRow = Record<string, string> & {
		_id: string;
		_source?: string;
	};
	type ExportItem = (MenuItem | InventoryItem) & {
		_id?: string;
		id?: string;
		lightspeedSku?: string;
		posMenus?: Array<{ id?: string; name?: string }>;
	};

	const FILTER_ALL = "all";
	const FILTER_UNASSIGNED = "unassigned";

	let sections = $state<MenuSection[]>([]);
	let inventory = $state<InventoryItem[]>([]);
	let loading = $state(true);
	let savingSkus = $state(false);
	let error = $state("");
	let query = $state("");
	let menuFilter = $state(FILTER_ALL);
	let posMenus = $state<PosMenu[]>([]);
	let selectedCount = $state(0);
	let gridApi = $state.raw<GridApi<GridRow> | undefined>(undefined);

	const fallMenuName = $derived(findMenuName(posMenus, DEFAULT_LIGHTSPEED_MENU));
	const gwendaMenuName = $derived(findMenuName(posMenus, LIVE_POS_MENU_NAME));
	const menuFilterOptions = $derived.by((): SelectOption[] => {
		const opts: SelectOption[] = [
			{ value: FILTER_ALL, label: "All menus" },
			...[...posMenus]
				.sort(
					(a, b) =>
						(a.orderRank ?? 0) - (b.orderRank ?? 0) ||
						String(a.name || "").localeCompare(String(b.name || "")),
				)
				.map((menu) => ({
					value: String(menu.id),
					label: menu.name || `Menu ${menu.id}`,
				})),
			{ value: FILTER_UNASSIGNED, label: "Unassigned drinks" },
		];
		return opts;
	});
	const filterMenuName = $derived.by(() => {
		if (menuFilter === FILTER_ALL || menuFilter === FILTER_UNASSIGNED) return "";
		const hit = posMenus.find((menu) => String(menu.id) === menuFilter);
		return hit?.name || "";
	});
	/** Menus written into Menu/Screen for the visible drink set. */
	const exportMenus = $derived.by(() => {
		if (filterMenuName) return [filterMenuName];
		const named = posMenus
			.map((menu) => String(menu.name || "").trim())
			.filter(Boolean);
		if (named.length) return named;
		return [fallMenuName, gwendaMenuName].filter(Boolean) as string[];
	});

	const menuItems = $derived(collectMenuItems(sections) as MenuItem[]);
	const visibleBaseMenuItems = $derived.by(() => {
		if (menuFilter === FILTER_ALL) return menuItems;
		if (menuFilter === FILTER_UNASSIGNED) {
			return menuItems.filter((item) => !(item.posMenus || []).length);
		}
		const name = filterMenuName;
		if (!name) return menuItems;
		return menuItems.filter((item) => itemOnPosMenu(item, name));
	});
	const expandedMenuItems = $derived(
		expandMenuItemsForLightspeedExport(visibleBaseMenuItems) as ExportItem[],
	);
	const inventoryForExport = $derived(
		withInventoryExportIds(
			inventoryExclusiveForExport(menuItems, inventory),
		) as ExportItem[],
	);
	const catalogBefore = $derived([
		...expandedMenuItems,
		...inventoryForExport,
	]);
	const catalogAllocated = $derived(
		withAllocatedLightspeedSkus(catalogBefore) as ExportItem[],
	);
	const allocatedMenuItems = $derived(
		catalogAllocated.filter(
			(item) => !String(item._id || item.id || "").startsWith("inv:"),
		) as MenuItem[],
	);
	const allocatedInventory = $derived(
		catalogAllocated.filter((item) =>
			String(item._id || item.id || "").startsWith("inv:"),
		) as ExportItem[],
	);
	const newSkuCount = $derived(
		newlyAllocatedLightspeedSkus(catalogBefore, catalogAllocated).length,
	);
	const previewRows = $derived(
		lightspeedCombinedImportPreviewRows(
			allocatedMenuItems,
			allocatedInventory,
			exportMenus,
		) as GridRow[],
	);
	const rows = $derived(filterRows(previewRows, query));

	const columnDefs = $derived.by((): ColDef<GridRow>[] =>
		(LIGHTSPEED_COMBINED_IMPORT_HEADERS as string[]).map((header) => ({
			headerName: header,
			colId: header,
			field: header,
			minWidth: columnWidth(header),
			flex: header === "Name" || header === "Menu/Screen" ? 1.4 : 0,
			tooltipField: header,
			cellClass: emptyCellClass,
		})),
	);

	onMount(() => {
		void load();
	});

	function findMenuName(menus: PosMenu[], preferred: string) {
		const want = preferred.trim().toLowerCase();
		const hit = menus.find(
			(menu) => String(menu.name || "").trim().toLowerCase() === want,
		);
		return hit?.name || preferred;
	}

	function columnWidth(header: string) {
		if (header === "Name" || header === "Menu/Screen" || header === "Button name") {
			return 160;
		}
		if (header === "SKU" || header === "Price" || header === "Type") {
			return 100;
		}
		if (
			header === "Accounting group" ||
			header === "Sharing mode" ||
			header === "Package unit (stock mngmt)"
		) {
			return 130;
		}
		return 110;
	}

	function emptyCellClass(params: { value?: unknown }) {
		return params.value == null || params.value === "" ? "cell-empty" : undefined;
	}

	function filterRows(source: GridRow[], raw: string): GridRow[] {
		const ranked = [...source].sort((a, b) =>
			String(a.Name || "").localeCompare(String(b.Name || "")),
		);
		const q = raw.trim().toLowerCase();
		if (!q) return ranked;
		return ranked.filter((row) =>
			(LIGHTSPEED_COMBINED_IMPORT_HEADERS as string[])
				.map((header) => String(row[header] || ""))
				.join(" ")
				.toLowerCase()
				.includes(q),
		);
	}

	async function load() {
		loading = true;
		error = "";
		try {
			const [menuData, stockData] = await Promise.all([
				getMenu(),
				getInventory(true),
			]);
			sections = menuData.sections || [];
			posMenus = menuData.posMenus || [];
			inventory = stockData.items || [];
			if (menuFilter === FILTER_ALL || !posMenus.some((m) => String(m.id) === menuFilter)) {
				const fall = posMenus.find(
					(menu) =>
						String(menu.name || "").trim().toLowerCase() ===
						DEFAULT_LIGHTSPEED_MENU.toLowerCase(),
				);
				menuFilter = fall ? String(fall.id) : FILTER_ALL;
			}
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Could not load catalog.";
			error = message;
			toast.error(message);
		} finally {
			loading = false;
		}
	}

	function selectedRows(): GridRow[] {
		return (gridApi?.getSelectedRows() || []) as GridRow[];
	}

	function syncSelectionCount() {
		selectedCount = selectedRows().length;
	}

	function selectAllVisible() {
		gridApi?.selectAll("filtered");
		syncSelectionCount();
	}

	function clearSelected() {
		gridApi?.deselectAll();
		syncSelectionCount();
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

	async function persistNewSkus(before: ExportItem[], after: ExportItem[]) {
		const created = newlyAllocatedLightspeedSkus(before, after);
		if (!created.length) return 0;
		await previewLightspeedCsv("", {
			action: "stamp-skus",
			patches: created.map((row) => ({
				id: row.id,
				lightspeedSku: row.lightspeedSku,
			})),
		});
		await load();
		return created.length;
	}

	async function downloadImport() {
		const selected = selectedRows();
		if (!selected.length) {
			toast.error("Select at least one item.");
			return;
		}
		const byId = new Map(
			catalogAllocated.map((item) => [String(item._id || item.id || ""), item]),
		);
		const selectedCatalog = selected
			.map((row) => byId.get(row._id))
			.filter((item): item is ExportItem => Boolean(item));
		if (!selectedCatalog.length) {
			toast.error("Could not match selected rows to the catalog.");
			return;
		}
		const missingSku = selectedCatalog.filter((item) => !storedLightspeedSku(item));
		if (missingSku.length) {
			toast.error("Every selected item needs a SKU.");
			return;
		}
		const selectedDrinks = selectedCatalog.filter(
			(item) => !String(item._id || item.id || "").startsWith("inv:"),
		) as MenuItem[];
		const selectedStock = selectedCatalog.filter((item) =>
			String(item._id || item.id || "").startsWith("inv:"),
		);
		if (!selectedDrinks.length && !selectedStock.length) {
			toast.error("Nothing in the current menu filter is selected.");
			return;
		}
		const missingScreen = selectedDrinks.filter(
			(item) => posScreenPaths(item).length === 0,
		);
		savingSkus = true;
		try {
			const stamped = await persistNewSkus(catalogBefore, catalogAllocated);
			const csv = lightspeedCombinedItemImportCsv(
				selectedDrinks,
				selectedStock,
				exportMenus,
			);
			download(`lightspeed-items-${selectedCatalog.length}.csv`, csv);
			if (missingScreen.length) {
				toast.error(
					`${missingScreen.length} drink${missingScreen.length === 1 ? "" : "s"} without a POS screen. Stock rows are fine blank. Set screens on the drink editor before import.`,
				);
			} else if (stamped) {
				toast.ok(
					`Downloaded ${selectedCatalog.length}. Saved ${stamped} new SKU${stamped === 1 ? "" : "s"} as G-codes (G0001, G0002, …).`,
				);
			} else {
				toast.ok(
					`Downloaded ${selectedCatalog.length} items (${selectedDrinks.length} drinks, ${selectedStock.length} stock). Map identical column names.`,
				);
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not save new SKUs.");
		} finally {
			savingSkus = false;
		}
	}
</script>

<div class="page">
	<PageHeader
		title="Export"
		subtitle="Lightspeed item import. Filter by menu, select rows, then download."
	>
		{#snippet actions()}
			<PageHelp title="POS export" topics={EXPORT_HELP} />
			<Button
				variant="outline"
				size="sm"
				disabled={!rows.length}
				onclick={selectAllVisible}
			>
				Select all
			</Button>
			<Button
				variant="ghost"
				size="sm"
				disabled={!selectedCount}
				onclick={clearSelected}
			>
				Clear
			</Button>
			<Button
				variant="primary"
				size="sm"
				disabled={!selectedCount || savingSkus}
				title={newSkuCount
					? `${newSkuCount} new SKU${newSkuCount === 1 ? "" : "s"} will be saved on download`
					: "Download the selection"}
				onclick={() => void downloadImport()}
			>
				{selectedCount ? `Download · ${selectedCount}` : "Download"}
			</Button>
		{/snippet}
	</PageHeader>

	<div class="body">
		<div class="toolbar">
			<label class="menu-field" for="ls-export-menu">
				<span>Menu</span>
				<NativeSelect
					id="ls-export-menu"
					bind:value={menuFilter}
					options={menuFilterOptions}
					size="sm"
				/>
			</label>
			<SearchField
				bind:value={query}
				placeholder="Filter rows"
				ariaLabel="Filter rows"
				count={query ? rows.length : undefined}
				width="min(100%, 18rem)"
			/>
		</div>

		{#if error}
			<p class="error">{error}</p>
		{:else if !loading && menuItems.length === 0 && inventory.length === 0}
			<p class="empty">No menu or inventory items yet.</p>
		{:else if !loading && rows.length === 0}
			<p class="empty">No rows match that filter.</p>
		{:else}
			<div class="grid-host">
				<DataGrid
					rowData={rows}
					{columnDefs}
					scrollKey="lightspeed-export"
					getRowId={(row) => row._id}
					domLayout="normal"
					gridOptions={{
						suppressCellFocus: true,
						suppressRowClickSelection: false,
						suppressScrollOnNewData: true,
						enableBrowserTooltips: true,
						rowSelection: {
							mode: "multiRow",
							checkboxes: true,
							headerCheckbox: true,
							selectAll: "filtered",
							enableClickSelection: true,
						},
						onGridReady: (event) => {
							gridApi = event.api as GridApi<GridRow>;
							event.api.selectAll("filtered");
							syncSelectionCount();
						},
						onSelectionChanged: () => syncSelectionCount(),
						onFirstDataRendered: (event) => {
							if (!gridApi) gridApi = event.api as GridApi<GridRow>;
							event.api.selectAll("filtered");
							syncSelectionCount();
						},
					}}
				/>
			</div>
		{/if}
	</div>

	<BusyOverlay
		active={loading || savingSkus}
		label={savingSkus ? "Saving new SKUs…" : "Loading drinks and stock…"}
	/>
</div>

<style>
	.page {
		position: relative;
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		overflow: hidden;
		background: var(--background);
	}

	.page :global(.page-header) {
		margin: 0;
		padding: var(--page-gutter) var(--page-gutter) 0;
	}

	.body {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-4);
		flex-shrink: 0;
		padding: var(--space-4) var(--page-gutter);
	}

	.menu-field {
		display: grid;
		gap: var(--space-1);
		min-width: min(100%, 16rem);
	}

	.menu-field span {
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.error,
	.empty {
		margin: var(--page-gutter);
		font-size: var(--text-sm);
	}

	.error {
		color: var(--danger);
	}

	.empty {
		color: var(--muted-foreground);
	}

	.grid-host {
		flex: 1;
		min-height: 0;
		padding: 0 var(--page-gutter) var(--page-gutter);
	}

	.grid-host :global(.cell-empty) {
		color: var(--muted-foreground);
		opacity: 0.45;
	}
</style>
