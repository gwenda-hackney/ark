<script lang="ts">
	/**
	 * Events, Pop-ups and Deals as a list (like Email's): each row its photo,
	 * its name with when it runs and what's on under it, its next night, and
	 * whether the website has it. A row opens it.
	 */
	import type { ColDef, ICellRendererParams, RowClickedEvent } from "ag-grid-community";
	import { DataGrid } from "../ui";
	import BadgeCell from "../ui/BadgeCell.svelte";
	import { hasRangeSelection, svelteCell } from "../ui/grid";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../ui/viewport.svelte";
	import { navigate } from "../app/nav";
	import PhotoCell from "../menu/cells/PhotoCell.svelte";
	import EventStackCell from "./cells/EventStackCell.svelte";
	import type { SeriesCardRow } from "./series-card";

	let { rows, scrollKey }: { rows: SeriesCardRow[]; scrollKey: string } = $props();

	const phone = mediaMatches(SHELL_MOBILE_QUERY);

	/** Under the name: when it runs, then a guest or the deal. */
	const subtitle = (row: SeriesCardRow) => [[row.cadence, row.time].filter(Boolean).join(", "), row.guest || row.offer].filter(Boolean).join(" · ");

	const columnDefs = $derived.by((): ColDef<SeriesCardRow>[] => [
		{
			headerName: "",
			colId: "photo",
			width: 84,
			minWidth: 72,
			flex: 0,
			sortable: false,
			cellClass: "photo-cell",
			cellRenderer: svelteCell(PhotoCell, (params: ICellRendererParams<SeriesCardRow>) => ({ url: params.data?.photo || "", alt: "", size: "lg" })),
		},
		{
			headerName: "Name",
			colId: "name",
			flex: 1,
			minWidth: 200,
			valueGetter: (p) => p.data?.name || "",
			cellRenderer: svelteCell(EventStackCell, (params: ICellRendererParams<SeriesCardRow>) => ({
				title: params.data?.name || "",
				subtitle: params.data ? (phone.matches ? [subtitle(params.data), params.data.next].filter(Boolean).join(" · ") : subtitle(params.data)) : "",
				href: params.data?.href || "",
			})),
		},
		{
			headerName: "Next",
			colId: "next",
			width: 240,
			flex: 0,
			hide: phone.matches,
			valueGetter: (p) => p.data?.next || "",
			cellClass: "next-cell",
		},
		{
			headerName: "Website",
			colId: "status",
			width: 140,
			flex: 0,
			valueGetter: (p) => p.data?.status || "",
			cellRenderer: svelteCell(BadgeCell, (params: ICellRendererParams<SeriesCardRow>) => ({
				label: params.data?.status || "",
				tone: params.data?.tone || "neutral",
				title: params.data?.statusTitle,
			})),
		},
	]);

	function openRow(event: RowClickedEvent<SeriesCardRow>) {
		if (hasRangeSelection()) return;
		const mouse = event.event;
		if (mouse instanceof MouseEvent && (mouse.button !== 0 || mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey)) return;
		if (event.data) navigate(event.data.href);
	}
</script>

<div class="frame">
	<DataGrid
		rowData={rows}
		{columnDefs}
		{scrollKey}
		hideHeader={phone.matches}
		getRowId={(row) => row.id}
		domLayout="normal"
		gridOptions={{ rowHeight: 80, getRowClass: () => "series-row", onRowClicked: openRow }}
	/>
</div>

<style>
	.frame {
		height: 100%;
		min-height: 0;
	}

	.frame :global(.series-row) {
		cursor: pointer;
	}

	.frame :global(.next-cell) {
		color: var(--fg-muted);
		font-size: var(--text-sm);
	}
</style>
