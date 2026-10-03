<script lang="ts">
	import type { ColDef, ICellRendererParams, RowClickedEvent } from "ag-grid-community";
	import type { FormSubmission } from "../app/api";
	import { hasRangeSelection, svelteCell } from "../ui/grid";
	import BadgeCell from "../ui/BadgeCell.svelte";
	import { decisionBadge } from "../ui/badge";
	import { navigate } from "../app/nav";
	import { formatWhen } from "../website/web-metrics";
	import { DataGrid } from "../ui";

	let { rows }: { rows: FormSubmission[] } = $props();

	const columnDefs: ColDef<FormSubmission>[] = [
		{
			headerName: "Name",
			flex: 1.2,
			minWidth: 140,
			valueGetter: (p) => p.data?.name || p.data?.email || "",
		},
		{
			headerName: "Email",
			field: "email",
			flex: 1.4,
			minWidth: 180,
		},
		{
			headerName: "Form",
			field: "formTitle",
			flex: 1,
			minWidth: 140,
		},
		{
			headerName: "Decision",
			field: "decision",
			width: 120,
			minWidth: 100,
			valueGetter: (p) => decisionBadge(p.data?.decision, p.data?.formSlug)?.label || "",
			cellRenderer: svelteCell(BadgeCell, (params: ICellRendererParams<FormSubmission>) => {
				const badge = decisionBadge(params.data?.decision, params.data?.formSlug);
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
	): ColDef<FormSubmission> {
		return {
			headerName,
			field,
			width: 150,
			minWidth: 110,
			valueFormatter: (p) => (p.value ? formatWhen(String(p.value)) : "Not sent"),
			cellClass: (p) => (p.value ? "" : "not-sent"),
		};
	}

	function openRow(event: RowClickedEvent<FormSubmission>) {
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
		rowData={rows}
		{columnDefs}
		scrollKey="forms"
		getRowId={(row) => row.id}
		gridOptions={{ onRowClicked: openRow }}
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

	.frame :global(.not-sent) {
		color: var(--danger);
	}
</style>
