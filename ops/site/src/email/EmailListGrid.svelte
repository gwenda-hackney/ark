<script lang="ts">
	/**
	 * Emails as a list (Email's first page): each row its lead picture, its
	 * name with the subject under it, where it stands, and when it last went,
	 * goes or was edited. A row opens its email.
	 */
	import type { ColDef, ICellRendererParams, RowClickedEvent } from "ag-grid-community";
	import { DataGrid } from "../ui";
	import BadgeCell from "../ui/BadgeCell.svelte";
	import { hasRangeSelection, svelteCell } from "../ui/grid";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../ui/viewport.svelte";
	import { navigate } from "../app/nav";
	import PhotoCell from "../menu/cells/PhotoCell.svelte";
	import EmailNameCell from "./cells/EmailNameCell.svelte";

	export type EmailListRow = {
		id: string;
		href: string;
		photo: string;
		name: string;
		subject: string;
		status: string;
		tone: string;
		/** "Last edited: Fri 20 Nov, 11:14". */
		when: string;
	};

	let { rows, scrollKey }: { rows: EmailListRow[]; scrollKey: string } = $props();

	const phone = mediaMatches(SHELL_MOBILE_QUERY);

	const columnDefs = $derived.by((): ColDef<EmailListRow>[] => [
		{
			headerName: "",
			colId: "photo",
			width: 84,
			minWidth: 72,
			flex: 0,
			sortable: false,
			cellClass: "photo-cell",
			cellRenderer: svelteCell(PhotoCell, (params: ICellRendererParams<EmailListRow>) => ({
				url: params.data?.photo || "",
				alt: "",
				size: "lg",
			})),
		},
		{
			headerName: "Email",
			colId: "name",
			flex: 1,
			minWidth: 180,
			sortable: false,
			valueGetter: (p) => p.data?.name || "",
			cellRenderer: svelteCell(EmailNameCell, (params: ICellRendererParams<EmailListRow>) => ({
				title: params.data?.name || "",
				subtitle: phone.matches ? [params.data?.subject, params.data?.when].filter(Boolean).join(" · ") : params.data?.subject || "",
			})),
		},
		{
			headerName: "Status",
			colId: "status",
			width: 130,
			flex: 0,
			sortable: false,
			valueGetter: (p) => p.data?.status || "",
			cellRenderer: svelteCell(BadgeCell, (params: ICellRendererParams<EmailListRow>) => ({
				label: params.data?.status || "",
				tone: params.data?.tone || "neutral",
			})),
		},
		{
			headerName: "When",
			colId: "when",
			width: 260,
			flex: 0,
			sortable: false,
			hide: phone.matches,
			valueGetter: (p) => p.data?.when || "",
			cellClass: "when-cell",
		},
	]);

	function openRow(event: RowClickedEvent<EmailListRow>) {
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
		domLayout="autoHeight"
		gridOptions={{ rowHeight: 80, getRowClass: () => "email-row", onRowClicked: openRow }}
	/>
</div>

<style>
	.frame :global(.email-row) {
		cursor: pointer;
	}

	/* As tall as its rows: AG Grid keeps a short list 150px tall otherwise. */
	.frame :global(.ag-grid-scrolling-rows.ag-layout-auto-height) {
		min-height: 0 !important;
	}

	.frame :global(.when-cell) {
		color: var(--fg-muted);
		font-size: var(--text-sm);
	}
</style>
