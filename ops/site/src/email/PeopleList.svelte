<script lang="ts">
	/**
	 * Email → People: everyone on our own list (Wi-Fi and website sign-ups),
	 * which the Mailchimp sync copies to Mailchimp every hour. Each with where
	 * they stand in Mailchimp, where and when we got them, and the last day
	 * they were on the Wi-Fi. Reads only; admins only.
	 */
	import type { ColDef } from "ag-grid-community";
	import { Card, DataGrid, SearchField } from "../ui";
	import BadgeCell from "../ui/BadgeCell.svelte";
	import { svelteCell } from "../ui/grid";
	import { listPeople, type ListPerson, type PeopleCounts } from "./email-api";

	let { isAdmin }: { isAdmin: boolean } = $props();

	let people = $state<ListPerson[] | null>(null);
	let counts = $state<PeopleCounts | null>(null);
	let error = $state("");
	let search = $state("");

	$effect(() => {
		if (!isAdmin) return;
		void listPeople()
			.then((data) => {
				people = data.people;
				counts = data.counts;
				error = "";
			})
			.catch((err) => (error = err instanceof Error ? err.message : "Couldn't load them."));
	});

	const shown = $derived.by(() => {
		const query = search.trim().toLowerCase();
		if (!people || !query) return people || [];
		return people.filter((person) => person.email.includes(query) || person.mailchimp.label.toLowerCase().includes(query) || person.source.toLowerCase().includes(query));
	});

	/** "20 Nov 2026", or a dash. */
	function day(iso: string | null | undefined): string {
		if (!iso) return "–";
		const [year, month, date] = iso.split("-").map(Number);
		if (!year || !month || !date) return "–";
		return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
	}

	const subtitle = $derived(
		counts
			? `${counts.total.toLocaleString("en-GB")} people · ${counts.in} in Mailchimp · ${counts.waiting} waiting · ${counts.unsubscribed} unsubscribed · ${counts.off} not on the list`
			: "Our list, as the Mailchimp sync sends it",
	);

	const emptyText = $derived(!isAdmin ? "Only admins can see the people on the list" : error ? "Couldn't load" : people ? (search ? "No one matches" : "No one yet") : "Loading…");

	const columnDefs: ColDef<ListPerson>[] = [
		{ headerName: "Email", field: "email", flex: 1, minWidth: 220, tooltipField: "email" },
		{
			headerName: "Mailchimp",
			colId: "mailchimp",
			width: 160,
			minWidth: 140,
			valueGetter: (p) => p.data?.mailchimp.label || "",
			tooltipValueGetter: (p) => {
				const person = p.data;
				if (!person) return "";
				return person.mailchimp.status === "unsubscribed" && person.unsubscribedOn
					? `Unsubscribed in Mailchimp on ${day(person.unsubscribedOn)}.`
					: person.mailchimp.detail;
			},
			cellRenderer: svelteCell(BadgeCell, (params: { data?: ListPerson }) => ({
				label: params.data?.mailchimp.label || "",
				tone: params.data?.mailchimp.tone || "neutral",
			})),
		},
		{ headerName: "From", field: "source", width: 150, minWidth: 110 },
		{
			headerName: "Got them",
			field: "acquiredOn",
			width: 140,
			minWidth: 120,
			valueFormatter: (p) => day(p.value),
			comparator: (a, b) => String(a || "").localeCompare(String(b || "")),
		},
		{
			headerName: "Last seen on the Wi-Fi",
			field: "lastSeenOn",
			width: 190,
			minWidth: 160,
			valueFormatter: (p) => day(p.value),
			comparator: (a, b) => String(a || "").localeCompare(String(b || "")),
		},
	];
</script>

<Card title="People" {subtitle} fill>
	{#snippet actions()}
		<SearchField bind:value={search} placeholder="Search emails…" ariaLabel="Search people" count={shown.length} />
	{/snippet}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<div class="frame">
		{#key emptyText}
			<DataGrid
				rowData={shown}
				{columnDefs}
				getRowId={(row) => String(row.id)}
				scrollKey="email-people"
				gridOptions={{ overlayNoRowsTemplate: `<span>${emptyText}</span>`, enableBrowserTooltips: true }}
			/>
		{/key}
	</div>
	<p class="note">Our own list: Wi-Fi and website sign-ups. The Mailchimp sync sends new ones every hour and brings Mailchimp's unsubscribes back. Anyone added straight into Mailchimp isn't here.</p>
</Card>

<style>
	.frame {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 12rem;
	}
	.note {
		margin: var(--space-2) 0 0;
		color: var(--muted-foreground);
		font-size: var(--text-xs);
	}
	.error {
		margin: 0 0 var(--space-2);
		color: var(--destructive);
		font-size: var(--text-sm);
	}
</style>
