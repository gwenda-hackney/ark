<script lang="ts">
	/**
	 * Menu → Menus (#305): every menu, with its type, dates, days, pop-up
	 * kitchen, number of items and status. A row opens the menu's page
	 * (MenuEditor), where its details and sections are; Add menu starts one.
	 * Like Events and Drinks, the list stays mounted under the menu, which
	 * comes forward over it (editorZoom); closing it steps back to the list
	 * where it was scrolled. /menus/<id> still opens a menu directly.
	 */
	import { onMount, untrack } from "svelte";
	import type { ColDef, ICellRendererParams, RowClickedEvent } from "ag-grid-community";
	import { Button, DataGrid, EmptyState, PageHeader, Skeleton } from "../ui";
	import BadgeCell from "../ui/BadgeCell.svelte";
	import { hasRangeSelection, svelteCell } from "../ui/grid";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../ui/viewport.svelte";
	import { Icon } from "../app/shell";
	import * as api from "../app/api";
	import { menuPagePath, navigate, newMenuPath, parseShellPath } from "../app/nav";
	import MenuEditor from "./MenuEditor.svelte";
	import MenuNameCell from "./cells/MenuNameCell.svelte";
	import { MENU_KIND_LABELS, MENU_STATUS_TONES } from "./menu-form";
	import type { Menu } from "./types";

	let { path = "/menus" }: { path?: string } = $props();

	const route = $derived(parseShellPath(path));
	const editing = $derived(Boolean(route.isNew || route.slug));
	const phone = mediaMatches(SHELL_MOBILE_QUERY);

	let menus = $state<Menu[]>([]);
	let loading = $state(true);
	let error = $state("");

	async function load() {
		try {
			loading = true;
			error = "";
			menus = (await api.listMenus()).menus || [];
		} catch (err) {
			error = err instanceof Error ? err.message : "Couldn't load the menus.";
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		// Old links to the sections (Configuration › Menu sections): show the real address.
		if (route.moved) navigate("/menus", { replace: true, force: true });
	});

	// The list loads once (under a menu opened by its address too), and
	// again on the way back from a menu, keeping its rows and scroll.
	$effect(() => {
		if (!editing || untrack(() => !menus.length && !error)) void load();
	});

	const columnDefs = $derived.by((): ColDef<Menu>[] => {
		const compact = phone.matches;
		return [
			{
				headerName: "Menu",
				colId: "name",
				flex: 2,
				minWidth: 180,
				valueGetter: (p) => p.data?.name || "",
				cellRenderer: svelteCell(MenuNameCell, (params: ICellRendererParams<Menu>) => ({
					name: params.data?.name || "",
					note: compact
						? [params.data?.daysLabel, params.data?.statusLabel].filter(Boolean).join(" · ")
						: "",
					href: params.data ? menuPagePath(params.data.id) : "",
				})),
			},
			{
				headerName: "Type",
				colId: "kind",
				width: 100,
				hide: compact,
				valueGetter: (p) => (p.data ? MENU_KIND_LABELS[p.data.kind] : ""),
			},
			{
				headerName: "Dates",
				colId: "dates",
				flex: 1,
				minWidth: 130,
				hide: compact,
				valueGetter: (p) => p.data?.datesLabel || "",
			},
			{
				headerName: "Days",
				colId: "days",
				flex: 1,
				minWidth: 120,
				hide: compact,
				valueGetter: (p) => p.data?.daysLabel || "",
			},
			{
				headerName: "Pop-up kitchen",
				colId: "popup",
				flex: 1,
				minWidth: 140,
				hide: compact,
				valueGetter: (p) => p.data?.popupName || "",
			},
			{
				headerName: "Items",
				colId: "items",
				width: 90,
				type: "num",
				hide: compact,
				valueGetter: (p) => p.data?.itemCount ?? 0,
			},
			{
				headerName: "Status",
				colId: "status",
				width: 120,
				valueGetter: (p) => p.data?.statusLabel || "",
				cellRenderer: svelteCell(BadgeCell, (params: ICellRendererParams<Menu>) => ({
					label: params.data?.statusLabel || "",
					tone: params.data ? MENU_STATUS_TONES[params.data.status] : "neutral",
				})),
			},
		];
	});

	function openRow(event: RowClickedEvent<Menu>) {
		if (hasRangeSelection()) return;
		const mouse = event.event;
		if (mouse instanceof MouseEvent) {
			if (mouse.button !== 0) return;
			if (mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey) return;
		}
		if (event.data) navigate(menuPagePath(event.data.id));
	}
</script>

<div class="menus-root">
	<div class="page" class:parked={editing} inert={editing}>
		<PageHeader title="Menus" subtitle="Every menu guests can see: the drinks, and each pop-up kitchen's food.">
			{#snippet actions()}
				<Button type="button" onclick={() => navigate(newMenuPath())}>
					{#snippet icon()}<Icon name="plus" size={16} />{/snippet}
					Add menu
				</Button>
			{/snippet}
		</PageHeader>

		{#if error}
			<EmptyState tone="error" title="Couldn't load the menus" text={error}>
				{#snippet action()}
					<Button variant="outline" size="sm" onclick={() => void load()}>{#snippet icon()}<Icon name="refresh" size={14} />{/snippet}Try again</Button>
				{/snippet}
			</EmptyState>
		{:else if loading && !menus.length}
			<Skeleton rows={4} lines={1} label="Loading menus…" />
		{:else if !menus.length}
			<EmptyState icon="menu" title="No menus yet" text="Add the drinks menu, or a pop-up kitchen's, then give it its sections.">
				{#snippet action()}
					<Button size="sm" onclick={() => navigate(newMenuPath())}>{#snippet icon()}<Icon name="plus" size={14} />{/snippet}Add menu</Button>
				{/snippet}
			</EmptyState>
		{:else}
			<div class="frame">
				<DataGrid
					rowData={menus}
					{columnDefs}
					scrollKey="menus"
					hideHeader={phone.matches}
					getRowId={(row) => row.id}
					domLayout="autoHeight"
					gridOptions={{ rowHeight: 56, onRowClicked: openRow, getRowClass: () => "menu-row" }}
				/>
			</div>
		{/if}
	</div>
	<!-- Always mounted: it comes forward over the list when a menu opens (EditorShell). -->
	<MenuEditor {path} open={editing} />
</div>

<style>
	.menus-root {
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		height: 100%;
		overflow: hidden;
	}

	/* Steps back and dims while a menu comes forward over it; it keeps its scroll. */
	.page {
		transition:
			transform 440ms var(--ease),
			opacity 440ms var(--ease);
	}

	.page.parked {
		pointer-events: none;
		transform: scale(0.97);
		opacity: 0.35;
	}

	@media (prefers-reduced-motion: reduce) {
		.page {
			transition: none;
		}
	}

	.page {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gutter);
		display: grid;
		gap: var(--space-4);
		align-content: start;
	}

	.frame :global(.menu-row) {
		cursor: pointer;
	}
</style>
