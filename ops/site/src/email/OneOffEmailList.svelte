<script lang="ts">
	/**
	 * Email → Write (#348): every one-off email, drafts and sent, newest
	 * change first. A row opens it; New email starts one.
	 */
	import type { ColDef, ICellRendererParams, RowClickedEvent } from "ag-grid-community";
	import { Button, DataGrid, EmptyState, Skeleton } from "../ui";
	import BadgeCell from "../ui/BadgeCell.svelte";
	import { hasRangeSelection, svelteCell } from "../ui/grid";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../ui/viewport.svelte";
	import { Icon } from "../app/shell";
	import { navigate } from "../app/nav";
	import type { OneOffSummary } from "./email-api";
	import { sentLine } from "./email-view";
	import { statusBadge, writePath } from "./one-off-view";
	import PromoteDialog from "./PromoteDialog.svelte";

	let {
		emails,
		loading = false,
		error = "",
		onretry,
	}: { emails: OneOffSummary[]; loading?: boolean; error?: string; onretry: () => void } = $props();

	const phone = mediaMatches(SHELL_MOBILE_QUERY);
	let promoting = $state(false);
	const columnDefs = $derived.by((): ColDef<OneOffSummary>[] => [
		{
			headerName: "Subject",
			colId: "subject",
			flex: 3,
			minWidth: 200,
			valueGetter: (p) => p.data?.subject || "(No subject)",
		},
		{
			headerName: "Status",
			colId: "status",
			width: 130,
			valueGetter: (p) => (p.data ? statusBadge(p.data.status).label : ""),
			cellRenderer: svelteCell(BadgeCell, (params: ICellRendererParams<OneOffSummary>) => ({
				label: params.data ? statusBadge(params.data.status).label : "",
				tone: params.data ? statusBadge(params.data.status).tone : "neutral",
			})),
		},
		{
			headerName: "Updated",
			colId: "updated",
			flex: 1,
			minWidth: 160,
			valueGetter: (p) => p.data?.updatedAt || "",
			valueFormatter: (p) => sentLine(p.value),
			sort: "desc",
			hide: phone.matches,
		},
	]);

	function openRow(event: RowClickedEvent<OneOffSummary>) {
		if (hasRangeSelection()) return;
		const mouse = event.event;
		if (mouse instanceof MouseEvent && (mouse.button !== 0 || mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey)) return;
		if (event.data) navigate(writePath(event.data.id));
	}
</script>

<div class="write">
	<div class="bar">
		<p class="count">{loading && !emails.length ? "Loading…" : `${emails.length} ${emails.length === 1 ? "email" : "emails"}`}</p>
		<div class="actions">
			<Button type="button" size="sm" variant="outline" onclick={() => (promoting = true)}>
				{#snippet icon()}<Icon name="send" size={14} />{/snippet}
				Promote…
			</Button>
			<Button type="button" size="sm" onclick={() => navigate(writePath("new"))}>
				{#snippet icon()}<Icon name="plus" size={14} />{/snippet}
				New email
			</Button>
		</div>
	</div>
	{#if error}
		<EmptyState tone="error" title="Couldn't load the emails" text={error}>
			{#snippet action()}
				<Button variant="outline" size="sm" onclick={onretry}>{#snippet icon()}<Icon name="refresh" size={14} />{/snippet}Try again</Button>
			{/snippet}
		</EmptyState>
	{:else if loading && !emails.length}
		<Skeleton rows={3} lines={1} label="Loading emails…" />
	{:else if !emails.length}
		<EmptyState icon="send" title="No emails yet" text="Write one: a picture, a few words, a button.">
			{#snippet action()}
				<Button size="sm" onclick={() => navigate(writePath("new"))}>{#snippet icon()}<Icon name="plus" size={14} />{/snippet}New email</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<div class="frame">
			<DataGrid
				rowData={emails}
				{columnDefs}
				scrollKey="one-off-emails"
				hideHeader={phone.matches}
				getRowId={(row) => String(row.id)}
				domLayout="autoHeight"
				gridOptions={{ rowHeight: 48, onRowClicked: openRow, getRowClass: () => "email-row" }}
			/>
		</div>
	{/if}
</div>

<PromoteDialog open={promoting} onclose={() => (promoting = false)} />

<style>
	.actions {
		display: flex;
		gap: var(--space-2);
	}
	.write {
		display: grid;
		gap: var(--space-3);
		align-content: start;
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.count {
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}
	.frame :global(.email-row) {
		cursor: pointer;
	}
</style>
