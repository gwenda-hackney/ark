<script lang="ts">
	import type { ColDef, ICellRendererParams, IsFullWidthRowParams, PostSortRowsParams, RowClickedEvent } from "ag-grid-community";
	import { hasRangeSelection, svelteCell } from "../ui/grid";
	import BadgeCell from "../ui/BadgeCell.svelte";
	import { decisionBadge } from "../ui/badge";
	import { navigate } from "../app/nav";
	import { formatWhen } from "../website/web-metrics";
	import { DataGrid } from "../ui";
	import GroupHeadingCell from "../ui/GroupHeadingCell.svelte";
	import { groupedItem, keepFullWidthGroupsTogether, withGroupRows, type GroupedGridRow } from "../ui/grid";
	import type { FormSubmission } from "../app/api";
	import type { FormGroup } from "./form-groups";

	type GroupedRow = GroupedGridRow<FormSubmission>;

	/**
	 * Every enquiry in one table, under a heading row for each form (so no
	 * Form column). A column sort sorts within each form.
	 */
	let { groups, scrollKey = "forms" }: { groups: FormGroup[]; scrollKey?: string } = $props();

	const rowData = $derived(withGroupRows(groups));
	const enquiry = groupedItem<FormSubmission>;

	const gridOptions = {
		onRowClicked: openRow,
		getRowHeight: (params: { data?: GroupedRow }) => (params.data?._kind === "group" ? 44 : undefined),
		isFullWidthRow: (params: IsFullWidthRowParams<GroupedRow>) => params.rowNode.data?._kind === "group",
		fullWidthCellRenderer: svelteCell(GroupHeadingCell, (params: ICellRendererParams<GroupedRow>) =>
			params.data?._kind === "group" ? { title: params.data.title, count: params.data.count } : {},
		),
		postSortRows: (params: PostSortRowsParams<GroupedRow>) => keepFullWidthGroupsTogether(params.nodes),
	};

	const columnDefs: ColDef<GroupedRow>[] = [
		{
			headerName: "Name",
			flex: 1.2,
			minWidth: 140,
			valueGetter: (p) => enquiry(p.data)?.name || enquiry(p.data)?.email || "",
		},
		{
			headerName: "Email",
			field: "email",
			flex: 1.4,
			minWidth: 180,
		},
		{
			headerName: "Decision",
			field: "decision",
			width: 120,
			minWidth: 100,
			valueGetter: (p) => decisionBadge(enquiry(p.data)?.decision, enquiry(p.data)?.formSlug)?.label || "",
			cellRenderer: svelteCell(BadgeCell, (params: ICellRendererParams<GroupedRow>) => {
				const badge = decisionBadge(enquiry(params.data)?.decision, enquiry(params.data)?.formSlug);
				return { label: badge?.label || "", tone: badge?.tone || "neutral" };
			}),
		},
		{
			headerName: "Status",
			field: "status",
			// Email verification was dropped, so status no longer means anything.
			// Kept hidden in case a manual review status comes back here.
			hide: true,
			width: 120,
			minWidth: 96,
		},
		{
			headerName: "Submitted",
			field: "submittedAt",
			flex: 1,
			minWidth: 160,
			valueFormatter: (p) => (p.value ? formatWhen(String(p.value)) : ""),
		},
		sentColumn("Notified", "notifySentAt"),
		sentColumn("Receipt", "receiptSentAt"),
	];

	function sentColumn(
		headerName: string,
		field: "notifySentAt" | "receiptSentAt",
	): ColDef<GroupedRow> {
		return {
			headerName,
			field,
			width: 150,
			minWidth: 110,
			valueFormatter: (p) => (p.value ? formatWhen(String(p.value)) : "Not sent"),
			cellClass: (p) => (p.value ? "" : "not-sent"),
		};
	}

	function openRow(event: RowClickedEvent<GroupedRow>) {
		if (event.data?._kind !== "row") return;
		if (hasRangeSelection()) return;
		const mouse = event.event;
		if (mouse instanceof MouseEvent) {
			if (mouse.button !== 0) return;
			if (mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey) return;
		}
		const id = event.data?.id;
		if (id) navigate(`/forms/${encodeURIComponent(id)}`);
	}
</script>

<div class="frame">
	<DataGrid
		{rowData}
		{columnDefs}
		{scrollKey}
		domLayout="autoHeight"
		getRowId={(row) => (row._kind === "group" ? row._id : row.id)}
		{gridOptions}
	/>
</div>

<style>
	.frame {
		min-width: 0;
	}

	.frame :global(.ag-row:not(.ag-full-width-row)) {
		cursor: pointer;
	}

</style>
