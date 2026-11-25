<script lang="ts">
	/**
	 * Users → People as a table: each person, their role, whether they can
	 * sign in (a switch of its own), and edit / delete. A row opens the person.
	 */
	import type { ColDef, ICellRendererParams, RowClickedEvent } from "ag-grid-community";
	import { DataGrid } from "../ui";
	import BadgeCell from "../ui/BadgeCell.svelte";
	import { hasRangeSelection, svelteCell } from "../ui/grid";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../ui/viewport.svelte";
	import PersonCell from "./cells/PersonCell.svelte";
	import SignInCell from "./cells/SignInCell.svelte";
	import UserActionsCell from "./cells/UserActionsCell.svelte";
	import type { OpsRole, OpsUser } from "./types";

	type Row = OpsUser & { rowId: string; busy: boolean; role: OpsRole | null };

	let {
		users,
		busyId = "",
		roleOf,
		onedit,
		ontoggle,
		onremove,
	}: {
		users: OpsUser[];
		busyId?: string;
		roleOf: (user: OpsUser) => OpsRole | null;
		onedit: (user: OpsUser) => void;
		ontoggle: (user: OpsUser) => void;
		onremove: (user: OpsUser) => void;
	} = $props();

	const phone = mediaMatches(SHELL_MOBILE_QUERY);

	const rowData = $derived<Row[]>(
		users.map((user) => {
			const rowId = String(user.id || user._id || user.email);
			return { ...user, rowId, busy: busyId === String(user.id), role: roleOf(user) };
		}),
	);

	const columnDefs = $derived.by((): ColDef<Row>[] => [
		{
			headerName: "Person",
			colId: "person",
			flex: 1,
			minWidth: 220,
			valueGetter: (p) => p.data?.name || p.data?.email || "",
			cellRenderer: svelteCell(PersonCell, (params: ICellRendererParams<Row>) => ({ name: params.data?.name || "", email: params.data?.email || "" })),
		},
		{
			headerName: "Role",
			colId: "role",
			width: 160,
			valueGetter: (p) => p.data?.role?.name || "",
			cellRenderer: svelteCell(BadgeCell, (params: ICellRendererParams<Row>) => ({
				label: params.data?.role?.name || "…",
				tone: params.data?.role?.owner ? "success" : "neutral",
			})),
		},
		{
			headerName: "Can sign in",
			colId: "active",
			width: 150,
			hide: phone.matches,
			valueGetter: (p) => (p.data?.active ? "Yes" : "No"),
			cellRenderer: svelteCell(SignInCell, (params: ICellRendererParams<Row>) => ({
				active: Boolean(params.data?.active),
				email: params.data?.email || "",
				busy: Boolean(params.data?.busy),
				ontoggle: () => params.data && ontoggle(params.data),
			})),
		},
		{
			headerName: "",
			colId: "actions",
			width: 104,
			sortable: false,
			cellRenderer: svelteCell(UserActionsCell, (params: ICellRendererParams<Row>) => ({
				email: params.data?.email || "",
				busy: Boolean(params.data?.busy),
				onedit: () => params.data && onedit(params.data),
				onremove: () => params.data && onremove(params.data),
			})),
		},
	]);

	function openRow(event: RowClickedEvent<Row>) {
		if (hasRangeSelection() || !event.data) return;
		onedit(event.data);
	}
</script>

<div class="frame list-fill">
	<DataGrid
		{rowData}
		{columnDefs}
		scrollKey="users"
		hideHeader={phone.matches}
		getRowId={(row) => row.rowId}
		gridOptions={{
			rowHeight: 60,
			onRowClicked: openRow,
			getRowClass: (params) => (params.data?.active ? "user-row" : "user-row off"),
		}}
	/>
</div>

<style>
	.frame {
		flex: 1;
		min-height: 0;
		min-width: 0;
	}
	.frame :global(.user-row) {
		cursor: pointer;
	}
	.frame :global(.user-row.off) {
		opacity: 0.6;
	}
</style>
