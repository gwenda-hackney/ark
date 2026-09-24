<script lang="ts">
	/**
	 * Shared liquors and ingredients — ABV feeds cocktail recipe calc.
	 */
	import { onMount, untrack } from "svelte";
	import { fade, fly } from "svelte/transition";
	import type { ColDef, ICellRendererParams } from "ag-grid-community";
	import { Button, BusyOverlay, DataGrid, SearchField } from "../../ui";
	import { Icon } from "../../shell";
	import { hasRangeSelection, svelteCell } from "../../lib/grid";
	import * as api from "../../lib/api";
	import { toast } from "../../lib/toast.svelte";
	import {
		inventoryItemPath,
		inventoryListPath,
		inventoryNewPath,
		itemMatchesKey,
		itemSlug,
		leaveEditor,
		loginNext,
		namesClash,
		navigate,
		parseShellPath,
		editorKey,
	} from "../../lib/nav";
	import { setCrumbLeaf } from "../../lib/crumbs.svelte";
	import { unsaved, rememberBlockedNav } from "../../lib/unsaved.svelte";
	import { restoreGridScroll, parkGridScroll, unparkGridScroll } from "../../lib/grid-scroll";
	import { easeOut, fadeMs, flyMs } from "../../lib/motion";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../../lib/viewport.svelte";
	import {
		INVENTORY_KINDS,
		formatGbp,
		type InventoryItem,
	} from "../../lib/types";
	import { priceBasisLabel } from "../../lib/cost";
	import InventoryEditor from "./InventoryEditor.svelte";
	import CompactInventoryList from "./CompactInventoryList.svelte";
	import NameCell from "./cells/NameCell.svelte";
	import ViewDetailsCell from "./cells/ViewDetailsCell.svelte";

	type GridRow = InventoryItem & { _id: string };

	let { path = "/inventory" }: { path?: string } = $props();

	let items = $state<InventoryItem[]>([]);
	let query = $state("");
	let loadError = $state("");
	let busy = $state(true);
	let busyLabel = $state("Loading…");
	const loading = $derived(busy && busyLabel === "Loading…");
	let showInactive = $state(false);
	let selectedId = $state<string | null>(null);
	let item = $state<InventoryItem | null>(null);
	let detailOpen = $state(false);
	let listPaneEl = $state<HTMLDivElement | undefined>();
	let missingId = $state("");
	let editorCleanToken = $state(0);
	let appliedPath = "";

	const inventoryRoute = $derived(parseShellPath(path));
	const q = $derived(query.trim().toLowerCase());
	const phone = mediaMatches(SHELL_MOBILE_QUERY);

	const rows = $derived.by((): GridRow[] =>
		items
			.filter((row) => {
				if (!showInactive && row.active === false) return false;
				if (!q) return true;
				const hay = [
					row.name,
					row.fullName,
					row.kind,
					row.abv,
					row.notes,
					...(row.suppliers || []).flatMap((entry) => [
						entry.name,
						entry.productUrl,
						entry.sku,
						entry.pack,
						entry.price != null ? String(entry.price) : "",
					]),
				]
					.filter(Boolean)
					.join(" ")
					.toLowerCase();
				return hay.includes(q);
			})
			.map((row) => ({
				...row,
				_id: String(row._id || row.id || ""),
			}))
			.sort((a, b) =>
				String(a.name || "").localeCompare(String(b.name || "")),
			),
	);

	function findById(id: string | null) {
		if (!id) return null;
		return items.find((row) => String(row._id || row.id) === id) || null;
	}

	function findByKey(key: string | null) {
		if (!key) return null;
		return items.find((row) => itemMatchesKey(row, key)) || null;
	}

	function blankItem(): InventoryItem {
		return {
			name: "",
			kind: "liquor",
			abv: "",
			defaultUnit: "ml",
			suppliers: [],
			notes: "",
			active: true,
		};
	}

	function openItem(next: InventoryItem, skipNav = false) {
		parkGridScroll("inventory-list", listPaneEl);
		selectedId = String(next._id || next.id || "") || null;
		item = {
			...next,
			suppliers: (next.suppliers || []).map((entry) => ({ ...entry })),
		};
		detailOpen = true;
		missingId = "";
		if (!skipNav) {
			navigate(next.name?.trim() ? inventoryItemPath(next.name) : inventoryNewPath());
		}
	}

	function restoreListScroll() {
		restoreGridScroll(listPaneEl, "inventory-list", [
			0,
			16,
			50,
			fadeMs + 20,
			fadeMs + 80,
			fadeMs + 180,
			fadeMs + 320,
			fadeMs + 500,
		]);
		window.setTimeout(() => unparkGridScroll("inventory-list"), fadeMs + 520);
	}

	function backToGrid(opts: { force?: boolean } = {}) {
		leaveEditor(inventoryListPath(), opts);
	}

	function newItem() {
		navigate(inventoryNewPath());
	}

	async function load() {
		const data = await api.getInventory(true);
		items = data.items || [];
		loadError = "";
	}

	function applySavedItem(saved: InventoryItem | undefined, fallbackId: string) {
		if (!saved) return false;
		const id = String(saved._id || saved.id || fallbackId);
		items = [
			...items.filter((row) => String(row._id || row.id) !== id),
			saved,
		].sort((a, b) =>
			String(a.name || "").localeCompare(String(b.name || ""), undefined, {
				sensitivity: "base",
			}),
		);
		selectedId = id;
		item = findById(selectedId) || saved;
		return true;
	}

	async function reload() {
		try {
			busy = true;
			busyLabel = "Loading…";
			await load();
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to load inventory.";
			if (message.startsWith("auth:")) {
				window.location.href = `/api/auth/login?next=${encodeURIComponent(loginNext("/inventory"))}`;
				return;
			}
			loadError = message;
		} finally {
			busy = false;
		}
	}

	async function save() {
		if (!item || busy) return;
		const name = String(item.name || "").trim();
		if (!name) {
			toast.error("Name is required.");
			return;
		}
		const clash = items.find(
			(row) =>
				String(row._id || row.id) !== String(item?._id || item?.id || "") &&
				namesClash(row.name, name),
		);
		if (clash) {
			toast.error("An inventory item with that name already exists.");
			return;
		}
		try {
			busy = true;
			busyLabel = "Saving…";
			const payload = {
				name,
				fullName: item.fullName || "",
				kind: item.kind || "other",
				abv: item.abv || "",
				defaultUnit: item.defaultUnit || "",
				estimatedCost: item.estimatedCost ?? null,
				suppliers: (item.suppliers || []).filter(
					(entry) => (entry.name || "").trim() || (entry.productUrl || "").trim(),
				),
				notes: item.notes || "",
				active: item.active !== false,
				actualQty: item.actualQty ?? null,
				actualUnit: item.actualUnit || "",
			};
			const existing = String(item._id || item.id || "");
			const data = existing
				? await api.updateInventoryItem(existing, payload)
				: await api.createInventoryItem(payload);
			if (!applySavedItem(data.item, existing)) {
				selectedId = String(data.item?._id || data.item?.id || existing || "");
				await load();
				item = findById(selectedId) || data.item || item;
			}
			detailOpen = true;
			editorCleanToken += 1;
			const savedName = item?.name || name;
			if (savedName) navigate(inventoryItemPath(savedName), { replace: true, force: true });
			toast.ok("Saved.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Save failed.");
		} finally {
			busy = false;
		}
	}

	async function remove() {
		const id = String(item?._id || item?.id || "");
		if (!id) {
			backToGrid();
			return;
		}
		if (busy) return;
		try {
			busy = true;
			busyLabel = "Deleting…";
			await api.deleteInventoryItem(id);
			items = items.filter((row) => String(row._id || row.id) !== id);
			backToGrid();
			toast.ok("Removed.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Delete failed.");
		} finally {
			busy = false;
		}
	}

	const columnDefs = $derived.by((): ColDef<GridRow>[] => {
		const search = query.trim();
		const view = untrack(() => openItem);
		return [
		{
			headerName: "Name",
			field: "name",
			minWidth: 160,
			flex: 1.6,
			cellClass: "name-cell",
			valueGetter: (p) => p.data?.name || "Untitled",
			cellRenderer: svelteCell(
				NameCell,
				(params: ICellRendererParams<GridRow>) => ({
					item: params.data || null,
					query: search,
					onview: view,
				}),
			),
		},
		{
			headerName: "Kind",
			field: "kind",
			maxWidth: 120,
			minWidth: 100,
			flex: 0,
			valueFormatter: (p) =>
				INVENTORY_KINDS.find((k) => k.value === p.value)?.label ||
				String(p.value || ""),
		},
		{
			headerName: "ABV %",
			field: "abv",
			maxWidth: 96,
			minWidth: 80,
			flex: 0,
			type: "num",
			valueFormatter: (p) =>
				p.value == null || p.value === ""
					? ""
					: String(p.value).replace(/%/g, ""),
		},
		{
			headerName: "Unit",
			field: "defaultUnit",
			maxWidth: 100,
			minWidth: 84,
			flex: 0,
		},
		{
			headerName: "On hand",
			colId: "actualQty",
			maxWidth: 110,
			minWidth: 88,
			flex: 0,
			type: "num",
			valueGetter: (p) => p.data?.actualQty ?? null,
			valueFormatter: (p) => {
				if (p.value == null) return "";
				const unit = p.data?.actualUnit || "";
				return unit ? `${p.value} ${unit}` : String(p.value);
			},
		},
		{
			headerName: "Suppliers",
			colId: "suppliers",
			minWidth: 160,
			flex: 1.2,
			valueGetter: (p) =>
				(p.data?.suppliers || [])
					.map((entry) => entry.name || entry.productUrl || "")
					.filter(Boolean)
					.join(", "),
			tooltipValueGetter: (p) =>
				(p.data?.suppliers || [])
					.map((entry) => {
						const bits = [
							entry.name || "Supplier",
							entry.sku,
							entry.pack,
							entry.price != null ? formatGbp(entry.price) : "",
							entry.productUrl,
						].filter(Boolean);
						return bits.join(" · ");
					})
					.filter(Boolean)
					.join("\n"),
		},
		{
			headerName: "Cost",
			colId: "cost",
			maxWidth: 110,
			minWidth: 88,
			flex: 0,
			type: "num",
			valueGetter: (p) => {
				const priced = (p.data?.suppliers || []).find(
					(entry) => entry.price != null,
				);
				return priced?.price ?? null;
			},
			valueFormatter: (p) => formatGbp(p.value),
		},
		{
			headerName: "Cost basis",
			colId: "priceBasis",
			minWidth: 148,
			maxWidth: 168,
			flex: 0,
			filter: "agTextColumnFilter",
			suppressHeaderMenuButton: false,
			filterParams: {
				filterOptions: ["contains", "equals"],
				defaultOption: "contains",
				maxNumConditions: 1,
				buttons: ["reset"],
			},
			valueGetter: (p) => priceBasisLabel(p.data),
			cellClass: (p) => {
				if (p.value === "Item estimate") return "gold";
				if (p.value === "Kind estimate") return "down";
				return "";
			},
		},
		{
			headerName: "Notes",
			field: "notes",
			minWidth: 100,
			flex: 1.4,
		},
		{
			headerName: "Active",
			field: "active",
			maxWidth: 88,
			minWidth: 72,
			flex: 0,
			valueGetter: (p) => (p.data?.active === false ? "No" : "Yes"),
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
					item: params.data || null,
					onview: view,
				}),
			),
		},
		];
	});

	onMount(() => {
		reload().catch(() => undefined);
		return () => setCrumbLeaf("");
	});

	$effect(() => {
		const route = inventoryRoute;
		void items;
		if (route.page !== "inventory") return;

		if (
			!unsaved.allowLeave &&
			unsaved.dirty &&
			detailOpen &&
			item
		) {
			const stay = item._id || item.id
				? `inventory:${itemSlug(item.name || "") || "item"}`
				: "inventory:new";
			if (editorKey(path) !== stay) {
				rememberBlockedNav(path);
				const stayPath =
					appliedPath && editorKey(appliedPath) === stay
						? appliedPath
						: item._id || item.id
							? inventoryItemPath(item.name || "")
							: inventoryNewPath();
				navigate(stayPath, { replace: true, force: true });
				unsaved.onBlock?.();
				return;
			}
		}

		if (route.isNew) {
			missingId = "";
			if (selectedId) return;
			if (appliedPath === path && detailOpen && item) return;
			appliedPath = path;
			openItem(blankItem(), true);
			selectedId = null;
			return;
		}

		if (route.slug) {
			const found = findByKey(route.slug);
			if (found) {
				appliedPath = path;
				missingId = "";
				const canonical = inventoryItemPath(found.name);
				if (canonical && canonical !== path) {
					navigate(canonical, { replace: true, force: true });
				}
				if (
					selectedId !== String(found._id || found.id) ||
					!detailOpen
				) {
					openItem(found, true);
				}
				return;
			}
			if (!items.length && !loadError) return;
			if (detailOpen && itemMatchesKey(item, route.slug)) {
				appliedPath = path;
				return;
			}
			appliedPath = path;
			missingId = route.slug;
			detailOpen = false;
			item = null;
			selectedId = null;
			return;
		}

		appliedPath = path;
		missingId = "";
		const wasOpen = detailOpen;
		detailOpen = false;
		if (wasOpen) {
			restoreListScroll();
			window.setTimeout(() => {
				if (!detailOpen) item = null;
			}, fadeMs + 40);
		} else {
			item = null;
		}
	});

	$effect(() => {
		const route = inventoryRoute;
		if (route.isNew) {
			setCrumbLeaf(item?.name?.trim() || "New item");
		} else if (route.slug) {
			setCrumbLeaf(item?.name?.trim() || (missingId ? "Not found" : ""));
		} else {
			setCrumbLeaf("");
		}
	});
</script>

<div class="workbench">
	<div class="stage">
		{#if loadError}
			<p class="error">{loadError}</p>
		{:else if missingId}
			<div class="pane list">
				<div class="missing">
					<p>That inventory item was not found.</p>
					<Button variant="outline" size="sm" onclick={backToGrid}>
						Back to inventory
					</Button>
				</div>
			</div>
		{:else}
			<div
				class="pane list"
				class:parked={detailOpen || Boolean(item)}
				bind:this={listPaneEl}
				inert={detailOpen || item ? true : undefined}
				aria-hidden={detailOpen || item ? true : undefined}
			>
				<header class="top">
					<div class="copy">
						<p class="eyebrow">Bar stock</p>
						<h1>Inventory</h1>
						<p class="lede">
							Liquors and ingredients for cocktail recipes. Open an item to
							see suppliers, pack price, and the product page.
						</p>
					</div>
					<div class="tools">
						<Button
							variant="outline"
							size="sm"
							onclick={reload}
							disabled={busy}
							busy={busy && busyLabel === "Loading…"}
						>
							{#snippet icon()}
								<Icon name="refresh" size={15} />
							{/snippet}
							Reload
						</Button>
						<Button
							variant="primary"
							size="sm"
							onclick={newItem}
							disabled={busy}
						>
							{#snippet icon()}
								<Icon name="plus" size={15} />
							{/snippet}
							Add item
						</Button>
					</div>
				</header>

				<div class="body">
					<div class="toolbar">
						<SearchField
							bind:value={query}
							placeholder="Search inventory"
							ariaLabel="Search inventory"
							width="min(100%, 22rem)"
							count={q ? rows.length : undefined}
						/>
						<label class="toggle">
							<input type="checkbox" bind:checked={showInactive} />
							<span>Show inactive</span>
						</label>
						<p class="meta">
							{rows.length} item{rows.length === 1 ? "" : "s"}
						</p>
					</div>

					{#if rows.length === 0 && !loading}
						<p class="empty">
							{q
								? "No inventory matches that search."
								: "No inventory yet. Add liquors and mixers here."}
						</p>
					{:else if phone.matches}
						<CompactInventoryList {rows} {selectedId} onview={openItem} />
					{:else}
						<div class="grid-host">
							<DataGrid
								rowData={rows}
								{columnDefs}
								scrollKey="inventory-list"
								context={{ selectedId }}
								getRowId={(row) => row._id}
								domLayout="normal"
								gridOptions={{
									suppressCellFocus: true,
									suppressRowClickSelection: true,
									suppressScrollOnNewData: true,
									getRowClass: (params) => {
										const selected =
											(params.context as { selectedId?: string | null } | null)
												?.selectedId ?? null;
										return params.data?._id === selected
											? "row-selected"
											: undefined;
									},
									onRowDoubleClicked: (event) => {
										if (hasRangeSelection()) return;
										if (event.data) openItem(event.data);
									},
								}}
							/>
						</div>
					{/if}
				</div>
			</div>
			{#if detailOpen && item}
				<div
					class="pane detail"
					in:fly={{ y: 10, duration: flyMs, easing: easeOut }}
					out:fade={{ duration: fadeMs, easing: easeOut }}
				>
					<InventoryEditor
						bind:item
						{busy}
						{busyLabel}
						cleanToken={editorCleanToken}
						onsave={save}
						ondelete={remove}
						onback={backToGrid}
					/>
				</div>
			{/if}
		{/if}
		<BusyOverlay active={loading} label={busyLabel} />
	</div>
</div>

<style>
	.workbench {
		position: relative;
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		overflow: hidden;
		background: var(--background);
	}

	.stage {
		position: relative;
		flex: 1;
		min-height: 0;
	}

	.pane {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		min-height: 0;
		background: var(--background);
	}

	.pane.parked {
		/* Keep the list laid out and scrolled under the detail.
		   visibility:hidden makes AG Grid dump its viewport. */
		pointer-events: none;
		z-index: 0;
	}

	.pane.detail {
		z-index: 1;
	}

	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--gap);
		flex-shrink: 0;
		padding: 1rem var(--page-gutter) 0.85rem;
		border-bottom: 1px solid var(--border);
	}

	.copy {
		display: grid;
		gap: 0.2rem;
		min-width: 0;
	}

	.eyebrow {
		margin: 0;
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--primary);
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.55rem;
		font-weight: 600;
		letter-spacing: -0.02em;
	}

	.lede {
		margin: 0;
		max-width: 36rem;
		font-size: var(--text);
		line-height: 1.45;
		color: var(--muted-foreground);
	}

	.tools {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	.body {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		padding: 0.75rem var(--page-gutter) 0.85rem;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		flex-shrink: 0;
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
		cursor: pointer;
	}

	.meta {
		margin: 0 0 0 auto;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}

	.grid-host {
		flex: 1;
		min-width: 0;
		min-height: 0;
	}

	.grid-host :global(.ag-row) {
		cursor: default;
	}

	.grid-host :global(.action-cell),
	.grid-host :global(.action-cell .ag-cell-wrapper),
	.grid-host :global(.action-cell .ag-cell-value) {
		justify-content: center;
		align-items: center;
		overflow: visible;
		height: 100%;
		line-height: 0;
	}

	.grid-host :global(.row-selected) {
		background: var(--primary-wash) !important;
	}

	.empty,
	.error {
		margin: 1.5rem 0;
		font-size: var(--text-md);
		color: var(--muted-foreground);
	}

	.error {
		color: var(--destructive);
		padding: 0 var(--page-gutter);
	}

	.missing {
		display: grid;
		gap: var(--gap-sm);
		place-content: center;
		justify-items: center;
		height: 100%;
		padding: 2rem var(--page-gutter);
		text-align: center;
		color: var(--muted-foreground);
	}

	.pane.detail :global(.editor) {
		flex: 1;
		min-height: 0;
	}

	@media (max-width: 900px) {
		.copy {
			display: none;
		}

		.top {
			padding-top: 0.65rem;
			padding-bottom: 0.65rem;
		}

		.body {
			padding-top: 0.55rem;
		}

		.meta {
			margin-left: 0;
		}
	}
</style>
