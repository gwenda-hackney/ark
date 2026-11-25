<script lang="ts">
	/**
	 * Emails as a list (Email's first page): each row its lead picture, its
	 * name with the subject under it, where it stands, and when it last went,
	 * goes or was edited. A row opens its email.
	 */
	import type { ColDef, ICellRendererParams, RowClickedEvent } from "ag-grid-community";
	import { DataGrid } from "../ui";
	import BadgeCell from "../ui/BadgeCell.svelte";
	import { groupedItem, hasRangeSelection, keepFullWidthGroupsTogether, svelteCell, withGroupRows, type GridGroup, type GroupedGridRow } from "../ui/grid";
	import GroupHeadingCell from "../ui/GroupHeadingCell.svelte";
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

	type Row = GroupedGridRow<EmailListRow>;

	/** The emails in one table, under a heading row for each group (Scheduled, Manually sent). */
	let { groups, scrollKey }: { groups: GridGroup<EmailListRow>[]; scrollKey: string } = $props();

	const rowData = $derived(withGroupRows(groups));
	const email = groupedItem<EmailListRow>;

	const phone = mediaMatches(SHELL_MOBILE_QUERY);

	const columnDefs = $derived.by((): ColDef<Row>[] => [
		{
			headerName: "",
			colId: "photo",
			width: 84,
			minWidth: 72,
			flex: 0,
			sortable: false,
			cellClass: "photo-cell",
			cellRenderer: svelteCell(PhotoCell, (params: ICellRendererParams<Row>) => ({
				url: email(params.data)?.photo || "",
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
			valueGetter: (p) => email(p.data)?.name || "",
			cellRenderer: svelteCell(EmailNameCell, (params: ICellRendererParams<Row>) => ({
				title: email(params.data)?.name || "",
				subtitle: phone.matches ? [email(params.data)?.subject, email(params.data)?.when].filter(Boolean).join(" · ") : email(params.data)?.subject || "",
			})),
		},
		{
			headerName: "Status",
			colId: "status",
			width: 130,
			flex: 0,
			sortable: false,
			valueGetter: (p) => email(p.data)?.status || "",
			cellRenderer: svelteCell(BadgeCell, (params: ICellRendererParams<Row>) => ({
				label: email(params.data)?.status || "",
				tone: email(params.data)?.tone || "neutral",
			})),
		},
		{
			headerName: "When",
			colId: "when",
			width: 260,
			flex: 0,
			sortable: false,
			hide: phone.matches,
			valueGetter: (p) => email(p.data)?.when || "",
			cellClass: "when-cell",
		},
	]);

	function openRow(event: RowClickedEvent<Row>) {
		if (hasRangeSelection()) return;
		const mouse = event.event;
		if (mouse instanceof MouseEvent && (mouse.button !== 0 || mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey)) return;
		const row = email(event.data);
		if (row) navigate(row.href);
	}
</script>

<div class="frame list-fill">
	<DataGrid
		{rowData}
		{columnDefs}
		{scrollKey}
		hideHeader={phone.matches}
		getRowId={(row) => (row._kind === "group" ? row._id : row.id)}
		gridOptions={{
			rowHeight: 80,
			getRowHeight: (params) => (params.data?._kind === "group" ? 52 : undefined),
			isFullWidthRow: (params) => params.rowNode.data?._kind === "group",
			fullWidthCellRenderer: svelteCell(GroupHeadingCell, (params: ICellRendererParams<Row>) =>
				params.data?._kind === "group" ? { title: params.data.title, note: params.data.note, count: params.data.count } : {},
			),
			postSortRows: (params) => keepFullWidthGroupsTogether(params.nodes),
			getRowClass: (params) => (params.data?._kind === "group" ? "" : "email-row"),
			onRowClicked: openRow,
		}}
	/>
</div>

<style>
	.frame :global(.email-row) {
		cursor: pointer;
	}

	.frame :global(.when-cell) {
		color: var(--fg-muted);
		font-size: var(--text-sm);
	}
</style>
