<script lang="ts">
	/**
	 * Upcoming nights on the shared ops grid, with a week heading between groups.
	 * Sort stays off: the list is already in date order. Column edges still resize.
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
	import WeekHeadingCell from "./cells/WeekHeadingCell.svelte";

	export type ScheduleTableRow =
		| { kind: "week"; id: string; label: string }
		| {
				kind: "night";
				id: string;
				href: string;
				weekday: string;
				dayDate: string;
				photo: string;
				name: string;
				meta: string;
				status: string;
				tone: string;
		  };

	let { rows }: { rows: ScheduleTableRow[] } = $props();

	const phone = mediaMatches(SHELL_MOBILE_QUERY);

	const columnDefs = $derived.by((): ColDef<ScheduleTableRow>[] => {
		const compact = phone.matches;
		return [
			{
				headerName: "When",
				colId: "when",
				width: 132,
				minWidth: 96,
				flex: 0,
				sortable: false,
				valueGetter: (p) => (p.data?.kind === "night" ? p.data.weekday : ""),
				cellRenderer: svelteCell(EventWhenCell, (params: ICellRendererParams<ScheduleTableRow>) => ({
					primary: params.data?.kind === "night" ? params.data.weekday : "",
					secondary: params.data?.kind === "night" ? params.data.dayDate : "",
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
				cellRenderer: svelteCell(PhotoCell, (params: ICellRendererParams<ScheduleTableRow>) => ({
					url: params.data?.kind === "night" ? params.data.photo : "",
					alt: "",
					size: "md",
				})),
			},
			{
				headerName: "Night",
				colId: "name",
				flex: 1,
				minWidth: 180,
				sortable: false,
				valueGetter: (p) => (p.data?.kind === "night" ? p.data.name : ""),
				tooltipValueGetter: (p) =>
					p.data?.kind === "night" ? [p.data.name, p.data.meta].filter(Boolean).join("\n") : "",
				cellRenderer: svelteCell(EventStackCell, (params: ICellRendererParams<ScheduleTableRow>) => ({
					title: params.data?.kind === "night" ? params.data.name : "",
					subtitle: params.data?.kind === "night" ? params.data.meta : "",
					href: params.data?.kind === "night" ? params.data.href : "",
				})),
			},
			{
				headerName: "Status",
				colId: "status",
				width: 120,
				minWidth: 96,
				flex: 0,
				sortable: false,
				hide: compact,
				valueGetter: (p) => (p.data?.kind === "night" ? p.data.status : ""),
				cellRenderer: svelteCell(EventStatusCell, (params: ICellRendererParams<ScheduleTableRow>) => ({
					label: params.data?.kind === "night" ? params.data.status : "",
					tone: params.data?.kind === "night" ? params.data.tone : "",
				})),
			},
		];
	});

	function openRow(event: RowClickedEvent<ScheduleTableRow>) {
		if (hasRangeSelection()) return;
		const mouse = event.event;
		if (mouse instanceof MouseEvent) {
			if (mouse.button !== 0) return;
			if (mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey) return;
		}
		const row = event.data;
		if (row?.kind === "night") navigate(row.href);
	}
</script>

<div class="frame">
	<DataGrid
		rowData={rows}
		{columnDefs}
		scrollKey="events-schedule"
		getRowId={(row) => row.id}
		domLayout="normal"
		gridOptions={{
			rowHeight: 56,
			getRowHeight: (params) => (params.data?.kind === "week" ? 52 : 56),
			isFullWidthRow: (params) => params.rowNode.data?.kind === "week",
			fullWidthCellRenderer: svelteCell(
				WeekHeadingCell,
				(params: ICellRendererParams<ScheduleTableRow>) => ({
					label: params.data?.kind === "week" ? params.data.label : "",
				}),
			),
			getRowClass: (params) => (params.data?.kind === "week" ? "week-row" : "event-row"),
			onRowClicked: openRow,
		}}
	/>
</div>

<style>
	.frame {
		height: 100%;
		min-height: 0;
	}

	.frame :global(.event-row) {
		cursor: pointer;
	}

	.frame :global(.week-row) {
		cursor: default;
	}
</style>
