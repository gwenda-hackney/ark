<script lang="ts">
	/**
	 * Every email sent to the mailing list, with Mailchimp's numbers, so
	 * nobody has to open Mailchimp to see how one did. Reads only.
	 */
	import type { ColDef } from "ag-grid-community";
	import { Card, DataGrid } from "../ui";
	import { getSentEmailReports, type SentEmailReport } from "./email-api";
	import { countAndRate, sentLine } from "./email-view";

	let { available }: { available: boolean | null } = $props();

	let reports = $state<SentEmailReport[] | null>(null);
	let error = $state("");

	async function load() {
		try {
			reports = (await getSentEmailReports()).reports;
			error = "";
		} catch (err) {
			error = err instanceof Error ? err.message : "Couldn't load them.";
		}
	}

	let asked = false;
	$effect(() => {
		if (available && !asked) {
			asked = true;
			void load();
		}
	});

	const number = (value: number) => value.toLocaleString("en-GB");
	const columnDefs: ColDef<SentEmailReport>[] = [
		{ headerName: "Sent", field: "sentAt", width: 150, minWidth: 130, valueFormatter: (p) => sentLine(p.value || null) },
		{ headerName: "Subject", field: "subject", flex: 1, minWidth: 220, tooltipField: "subject" },
		{ headerName: "To", field: "emailsSent", width: 90, minWidth: 80, valueFormatter: (p) => number(p.value || 0) },
		{
			headerName: "Opened",
			field: "opens",
			width: 120,
			minWidth: 100,
			valueFormatter: (p) => (p.data ? countAndRate(p.data.opens, p.data.openRate) : ""),
		},
		{
			headerName: "Clicked",
			field: "clicks",
			width: 120,
			minWidth: 100,
			valueFormatter: (p) => (p.data ? countAndRate(p.data.clicks, p.data.clickRate) : ""),
		},
		{ headerName: "Unsubscribed", field: "unsubscribed", width: 120, minWidth: 100 },
		{ headerName: "Bounced", field: "bounces", width: 100, minWidth: 90 },
	];
</script>

<Card
	title="Sent"
	subtitle={reports ? `${reports.length} ${reports.length === 1 ? "email" : "emails"} · from Mailchimp` : "From Mailchimp"}
>
	{#if available === false}
		<p class="muted">Mailchimp not connected here</p>
	{:else if error}
		<p class="error" role="alert">{error}</p>
	{:else if reports && !reports.length}
		<p class="muted">None yet</p>
	{:else if reports}
		<DataGrid rowData={reports} {columnDefs} getRowId={(row) => row.id} domLayout="autoHeight" density="compact" />
		<p class="muted small">Opened includes Apple Mail's automatic opens, so it runs high.</p>
	{:else}
		<p class="muted">Loading…</p>
	{/if}
</Card>

<style>
	.muted {
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}
	.small {
		margin-top: var(--space-2);
		font-size: var(--text-xs);
	}
	.error {
		margin: 0;
		color: var(--destructive);
		font-size: var(--text-sm);
	}
</style>
