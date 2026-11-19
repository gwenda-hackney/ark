<script lang="ts">
	/**
	 * What's on → Seasons (#353): something on sale for a while that leads to
	 * an enquiry, such as Christmas parties, shown on the website's home
	 * between its show days. The list stays mounted under a season's page
	 * (SeasonEditor), which comes forward over it, as Menus does.
	 */
	import { untrack } from "svelte";
	import type { ColDef, ICellRendererParams, RowClickedEvent } from "ag-grid-community";
	import { Button, DataGrid, EmptyState, PageHeader, Skeleton } from "../ui";
	import BadgeCell from "../ui/BadgeCell.svelte";
	import { hasRangeSelection, svelteCell } from "../ui/grid";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../ui/viewport.svelte";
	import { Icon } from "../app/shell";
	import { navigate, parseShellPath } from "../app/nav";
	import SeasonEditor from "./SeasonEditor.svelte";
	import { listSeasons, type Season } from "./seasons-api";
	import { STATE_LABELS, STATE_TONES, showDays } from "./season-view";

	let { path = "/seasons" }: { path?: string } = $props();

	const route = $derived(parseShellPath(path));
	const editing = $derived(Boolean(route.isNew || route.slug));
	const phone = mediaMatches(SHELL_MOBILE_QUERY);

	let seasons = $state<Season[]>([]);
	let loading = $state(true);
	let error = $state("");

	async function load() {
		try {
			loading = true;
			error = "";
			seasons = (await listSeasons()).seasons || [];
		} catch (err) {
			error = err instanceof Error ? err.message : "Couldn't load the seasons.";
		} finally {
			loading = false;
		}
	}

	// Once, and again on the way back from a season.
	$effect(() => {
		if (!editing || untrack(() => !seasons.length && !error)) void load();
	});

	const columnDefs = $derived.by((): ColDef<Season>[] => [
		{ headerName: "Season", colId: "name", flex: 2, minWidth: 180, valueGetter: (p) => p.data?.name || "" },
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
			cellRenderer: svelteCell(BadgeCell, (params: ICellRendererParams<Season>) => ({
				label: params.data ? STATE_LABELS[params.data.state] : "",
				tone: params.data ? STATE_TONES[params.data.state] : "neutral",
			})),
		},
	]);

	function openRow(event: RowClickedEvent<Season>) {
		if (hasRangeSelection()) return;
		const mouse = event.event;
		if (mouse instanceof MouseEvent && (mouse.button !== 0 || mouse.metaKey || mouse.ctrlKey || mouse.shiftKey)) return;
		if (event.data) navigate(`/seasons/${event.data.id}`);
	}
</script>

<div class="seasons-root">
	<div class="page" class:parked={editing} inert={editing}>
		<PageHeader title="Seasons" subtitle="Christmas parties and the like: a card on home between its show days, leading to the party form.">
			{#snippet actions()}
				<Button type="button" onclick={() => navigate("/seasons/new")}>
					{#snippet icon()}<Icon name="plus" size={16} />{/snippet}
					Add season
				</Button>
			{/snippet}
		</PageHeader>

		{#if error}
			<EmptyState tone="error" title="Couldn't load the seasons" text={error}>
				{#snippet action()}
					<Button variant="outline" size="sm" onclick={() => void load()}>{#snippet icon()}<Icon name="refresh" size={14} />{/snippet}Try again</Button>
				{/snippet}
			</EmptyState>
		{:else if loading && !seasons.length}
			<Skeleton rows={3} lines={1} label="Loading seasons…" />
		{:else if !seasons.length}
			<EmptyState icon="events" title="No seasons yet" text="Add one, such as Christmas parties, to put it on home for a while.">
				{#snippet action()}
					<Button size="sm" onclick={() => navigate("/seasons/new")}>{#snippet icon()}<Icon name="plus" size={14} />{/snippet}Add season</Button>
				{/snippet}
			</EmptyState>
		{:else}
			<div class="frame">
				<DataGrid
					rowData={seasons}
					{columnDefs}
					scrollKey="seasons"
					hideHeader={phone.matches}
					getRowId={(row) => String(row.id)}
					domLayout="autoHeight"
					gridOptions={{ rowHeight: 52, onRowClicked: openRow, getRowClass: () => "season-row" }}
				/>
			</div>
		{/if}
	</div>
	<!-- Always mounted: it comes forward over the list when a season opens (EditorShell). -->
	<SeasonEditor {path} open={editing} onchanged={() => void load()} />
</div>

<style>
	.seasons-root {
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		height: 100%;
		overflow: hidden;
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

	.frame :global(.season-row) {
		cursor: pointer;
	}
</style>
