<script lang="ts">
	/**
	 * Series list on the shared ops grid. Sort stays off: weekday order is the list.
	 * Column edges still resize.
	 */
	import type { ColDef, ICellRendererParams, RowClickedEvent } from "ag-grid-community";
	import { hasRangeSelection, svelteCell } from "../../lib/grid";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../../lib/viewport.svelte";
	import { navigate } from "../../lib/nav";
	import { DataGrid } from "../../ui";
	import PhotoCell from "../menu/cells/PhotoCell.svelte";
	import EventStackCell from "./cells/EventStackCell.svelte";
	import EventStatusCell from "./cells/EventStatusCell.svelte";
	import EventWhenCell from "./cells/EventWhenCell.svelte";

	export type SeriesTableRow = {
		id: string;
		href: string;
		when: string;
		photo: string;
		name: string;
		blurb: string;
		detail: string;
		time: string;
		guest: string;
		next: string;
		offer: string;
		status: string;
		tone: string;
	};

	let { rows }: { rows: SeriesTableRow[] } = $props();

	const phone = mediaMatches(SHELL_MOBILE_QUERY);

	const columnDefs = $derived.by((): ColDef<SeriesTableRow>[] => {
		const compact = phone.matches;
		const text = (headerName: string, field: keyof SeriesTableRow, flex: number, minWidth: number): ColDef<SeriesTableRow> => ({
			headerName,
			field,
			flex,
			minWidth,
			sortable: false,
			tooltipValueGetter: (p) => String(p.value || ""),
		});
		return [
			{
				headerName: "When",
				colId: "when",
				width: 132,
				minWidth: 96,
				flex: 0,
				sortable: false,
				valueGetter: (p) => p.data?.when || "",
				cellRenderer: svelteCell(EventWhenCell, (params: ICellRendererParams<SeriesTableRow>) => ({
					primary: params.data?.when || "",
				})),
			},
			{
				headerName: "",
				colId: "photo",
				width: 64,
				minWidth: 56,
				flex: 0,
				sortable: false,
				cellClass: "photo-cell",
				cellRenderer: svelteCell(PhotoCell, (params: ICellRendererParams<SeriesTableRow>) => ({
					url: params.data?.photo || "",
					alt: "",
					size: "md",
				})),
			},
			{
				headerName: "Series",
				colId: "name",
				flex: 1.5,
				minWidth: 160,
				sortable: false,
				valueGetter: (p) => p.data?.name || "",
				tooltipValueGetter: (p) =>
					[p.data?.name, compact ? p.data?.detail : p.data?.blurb].filter(Boolean).join("\n"),
				cellRenderer: svelteCell(EventStackCell, (params: ICellRendererParams<SeriesTableRow>) => ({
					title: params.data?.name || "",
					subtitle: compact ? params.data?.detail || "" : params.data?.blurb || "",
					href: params.data?.href || "",
				})),
			},
			{ ...text("Time", "time", 0.7, 96), hide: compact },
			{ ...text("Guest", "guest", 0.8, 110), hide: compact },
			{ ...text("Next", "next", 1.1, 140), hide: compact },
			{ ...text("Offer", "offer", 0.9, 110), hide: compact },
			{
				headerName: "Status",
				colId: "status",
				width: 120,
				minWidth: 96,
				flex: 0,
				sortable: false,
				hide: compact,
				valueGetter: (p) => p.data?.status || "",
				cellRenderer: svelteCell(EventStatusCell, (params: ICellRendererParams<SeriesTableRow>) => ({
					label: params.data?.status || "",
					tone: params.data?.tone || "",
				})),
			},
		];
	});

	function openRow(event: RowClickedEvent<SeriesTableRow>) {
		if (hasRangeSelection()) return;
		const mouse = event.event;
		if (mouse instanceof MouseEvent) {
			if (mouse.button !== 0) return;
			if (mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey) return;
		}
		const href = event.data?.href;
		if (href) navigate(href);
	}
</script>

<div class="frame">
	<DataGrid
		rowData={rows}
		{columnDefs}
		scrollKey="events-series"
		getRowId={(row) => row.id}
		domLayout="normal"
		gridOptions={{
			rowHeight: 56,
			onRowClicked: openRow,
		}}
	/>
</div>

<style>
	.frame {
		height: 100%;
		min-height: 0;
	}

	.frame :global(.ag-row) {
		cursor: pointer;
	}
</style>
