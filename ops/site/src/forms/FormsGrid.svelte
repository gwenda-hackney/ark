<script lang="ts">
	import type { ColDef, ICellRendererParams, IsFullWidthRowParams, PostSortRowsParams, RowClickedEvent } from "ag-grid-community";
	import { hasRangeSelection, svelteCell } from "../ui/grid";
	import BadgeCell from "../ui/BadgeCell.svelte";
	import { decisionBadge } from "../ui/badge";
	import { navigate } from "../app/nav";
	import { formatWhen } from "../website/web-metrics";
	import { DataGrid } from "../ui";
	import { keepUnderHeadings, withHeadings, type FormGroup, type GroupedRow } from "./form-groups";

	/**
	 * Every enquiry in one table, under a full-width heading row for each form
	 * (so no Form column). A column sort sorts within each form.
	 */
	let { groups, scrollKey = "forms" }: { groups: FormGroup[]; scrollKey?: string } = $props();

	const rowData = $derived(withHeadings(groups));

	/** A form's heading row: its name and how many. Built as elements, so a form's name is never read as HTML. */
	function headingRow(params: ICellRendererParams<GroupedRow>): HTMLElement {
		const row = document.createElement("div");
		row.className = "form-group-row";
		const data = params.data;
		if (data?.kind !== "group") return row;
		const title = document.createElement("span");
		title.className = "form-group-title";
		title.textContent = data.title;
		const count = document.createElement("span");
		count.className = "form-group-count";
		count.textContent = String(data.count);
		row.append(title, count);
		return row;
	}

	/** The enquiry on a row, or nothing on a heading row. */
	const enquiry = (row?: GroupedRow) => (row?.kind === "row" ? row : undefined);

	const gridOptions = {
		onRowClicked: openRow,
		isFullWidthRow: (params: IsFullWidthRowParams<GroupedRow>) => params.rowNode.data?.kind === "group",
		fullWidthCellRenderer: headingRow,
		postSortRows: (params: PostSortRowsParams<GroupedRow>) => keepUnderHeadings(params.nodes),
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
		if (event.data?.kind !== "row") return;
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
		getRowId={(row) => row.id}
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

	.frame :global(.form-group-row) {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		height: 100%;
		padding: 0 var(--space-4);
		background: var(--surface-1);
		font-weight: 600;
	}

	.frame :global(.form-group-count) {
		color: var(--muted-foreground);
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.frame :global(.not-sent) {
		color: var(--danger);
	}
</style>
