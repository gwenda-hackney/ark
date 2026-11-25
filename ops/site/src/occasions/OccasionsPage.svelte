<script lang="ts">
	/**
	 * What's on → Occasions (#353): something on sale for a while that leads to
	 * an enquiry, such as Christmas parties, shown on the website's home
	 * between its show days. The list stays mounted under an occasion's page
	 * (OccasionEditor), which comes forward over it, as Menus does.
	 */
	import { untrack } from "svelte";
	import type { ColDef, ICellRendererParams, RowClickedEvent } from "ag-grid-community";
	import { Button, DataGrid, EmptyState, ListPage, Skeleton } from "../ui";
	import BadgeCell from "../ui/BadgeCell.svelte";
	import PhotoCell from "../menu/cells/PhotoCell.svelte";
	import { hasRangeSelection, svelteCell } from "../ui/grid";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../ui/viewport.svelte";
	import { Icon } from "../app/shell";
	import { navigate, parseShellPath } from "../app/nav";
	import OccasionEditor from "./OccasionEditor.svelte";
	import { listOccasions, type Occasion } from "./occasions-api";
	import { STATE_LABELS, STATE_TONES, showDays } from "./occasion-view";

	let { path = "/occasions" }: { path?: string } = $props();

	const route = $derived(parseShellPath(path));
	const editing = $derived(Boolean(route.isNew || route.slug));
	const phone = mediaMatches(SHELL_MOBILE_QUERY);

	let occasions = $state<Occasion[]>([]);
	let loading = $state(true);
	let error = $state("");

	async function load() {
		try {
			loading = true;
			error = "";
			occasions = (await listOccasions()).occasions || [];
		} catch (err) {
			error = err instanceof Error ? err.message : "Couldn't load the occasions.";
		} finally {
			loading = false;
		}
	}

	// Once, and again on the way back from an occasion.
	$effect(() => {
		if (!editing || untrack(() => !occasions.length && !error)) void load();
	});

	const columnDefs = $derived.by((): ColDef<Occasion>[] => [
		// The card's photo, as the Events and Emails lists show theirs.
		{
			headerName: "",
			colId: "photo",
			width: 84,
			minWidth: 72,
			flex: 0,
			sortable: false,
			cellClass: "photo-cell",
			cellRenderer: svelteCell(PhotoCell, (params: ICellRendererParams<Occasion>) => ({ url: params.data?.imageUrl || "", alt: "", size: "lg" })),
		},
		{ headerName: "Occasion", colId: "name", flex: 2, minWidth: 180, valueGetter: (p) => p.data?.name || "" },
		{
			headerName: "On home",
			colId: "days",
			flex: 1,
			minWidth: 150,
			hide: phone.matches,
			valueGetter: (p) => (p.data ? showDays(p.data) : ""),
		},
		{
			headerName: "Status",
			colId: "state",
			width: 120,
			valueGetter: (p) => (p.data ? STATE_LABELS[p.data.state] : ""),
			cellRenderer: svelteCell(BadgeCell, (params: ICellRendererParams<Occasion>) => ({
				label: params.data ? STATE_LABELS[params.data.state] : "",
				tone: params.data ? STATE_TONES[params.data.state] : "neutral",
			})),
		},
	]);

	function openRow(event: RowClickedEvent<Occasion>) {
		if (hasRangeSelection()) return;
		const mouse = event.event;
		if (mouse instanceof MouseEvent && (mouse.button !== 0 || mouse.metaKey || mouse.ctrlKey || mouse.shiftKey)) return;
		if (event.data) navigate(`/occasions/${event.data.id}`);
	}
</script>

<div class="occasions-root">
	<ListPage title="Occasions" subtitle="Christmas parties and the like: a card on home between its show days, leading to the party form." parked={editing}>
			{#snippet actions()}
				<Button type="button" onclick={() => navigate("/occasions/new")}>
					{#snippet icon()}<Icon name="plus" size={16} />{/snippet}
					Add occasion
				</Button>
			{/snippet}

		{#if error}
			<EmptyState tone="error" title="Couldn't load the occasions" text={error}>
				{#snippet action()}
					<Button variant="outline" size="sm" onclick={() => void load()}>{#snippet icon()}<Icon name="refresh" size={14} />{/snippet}Try again</Button>
				{/snippet}
			</EmptyState>
		{:else if loading && !occasions.length}
			<Skeleton rows={3} lines={1} label="Loading occasions…" />
		{:else if !occasions.length}
			<EmptyState icon="events" title="No occasions yet" text="Add one, such as Christmas parties, to put it on home for a while.">
				{#snippet action()}
					<Button size="sm" onclick={() => navigate("/occasions/new")}>{#snippet icon()}<Icon name="plus" size={14} />{/snippet}Add occasion</Button>
				{/snippet}
			</EmptyState>
		{:else}
			<div class="frame list-fill">
				<DataGrid
					rowData={occasions}
					{columnDefs}
					scrollKey="occasions"
					hideHeader={phone.matches}
					getRowId={(row) => String(row.id)}
					gridOptions={{ rowHeight: 80, onRowClicked: openRow, getRowClass: () => "occasion-row" }}
				/>
			</div>
		{/if}
	</ListPage>
	<!-- Always mounted: it comes forward over the list when an occasion opens (EditorShell). -->
	<OccasionEditor {path} open={editing} onchanged={() => void load()} />
</div>

<style>
	.occasions-root {
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		height: 100%;
		overflow: hidden;
	}

	.frame :global(.occasion-row) {
		cursor: pointer;
	}
</style>
