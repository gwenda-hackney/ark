<script lang="ts">
	/**
	 * Settings → Venue details (#240): what the website says about the place.
	 * Opening hours now; the party facts join as their own card. A day opens
	 * the same editor everywhere: a dialog on desktop, a sheet on phones.
	 * Saving puts the week on the website by itself, as saving an event does
	 * (venue/server/venue-website.js).
	 */
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import type { ColDef, ICellRendererParams } from "ag-grid-community";
	import { Icon } from "../app/shell";
	import {
		Badge,
		BusyOverlay,
		Button,
		Card,
		DataGrid,
		Dialog,
		EmptyState,
		Field,
		PageHeader,
		RowAction,
		Skeleton,
		Switch,
		TimeField,
	} from "../ui";
	import { ROW_ACTION_COLUMN, svelteCell } from "../ui/grid";
	import { getVenueDetails, saveOpeningHours } from "../app/api";
	import { toast } from "../ui/toast.svelte";
	import { easeOut, flyMs } from "../ui/motion";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../ui/viewport.svelte";
	import { DAY_NAMES, DAYS, closesAfterMidnight, dayHoursLabel, dayProblem, validateWeek } from "./hours-model.js";
	import { blankWeek, savedMessage, websiteBadge, withDay } from "./venue-page";
	import type { DayKey, OpeningDay, OpeningHours, WebsiteState } from "./types";

	type DayRow = OpeningDay & { name: string; label: string };

	const phone = mediaMatches(SHELL_MOBILE_QUERY);

	let loading = $state(true);
	let loadError = $state("");
	let hours = $state<OpeningHours | null>(null);
	let website = $state<WebsiteState>("none");
	/** The week on the page: the saved one, or one being filled in before the first save. */
	let days = $state<OpeningDay[]>(blankWeek());

	let editing = $state<DayKey | null>(null);
	let draftClosed = $state(false);
	let draftOpens = $state("");
	let draftCloses = $state("");
	let dialogError = $state("");
	let saving = $state(false);

	const badge = $derived(websiteBadge(website));
	const rows = $derived<DayRow[]>(
		days.map((day) => ({
			...day,
			name: DAY_NAMES[day.day],
			label: day.closed || (day.opens && day.closes) ? dayHoursLabel(day) : "Not set",
		})),
	);
	const draft = $derived<OpeningDay | null>(
		editing ? { day: editing, closed: draftClosed, opens: draftOpens, closes: draftCloses } : null,
	);
	const lateClose = $derived(Boolean(draft && closesAfterMidnight(draft)));
	const nextDayName = $derived(editing ? DAY_NAMES[DAYS[(DAYS.indexOf(editing) + 1) % 7] as DayKey] : "");
	const changedLine = $derived.by(() => {
		if (!hours?.updatedAt) return "";
		const when = new Date(hours.updatedAt).toLocaleString("en-GB", {
			day: "numeric",
			month: "short",
			hour: "numeric",
			minute: "2-digit",
		});
		return hours.updatedBy ? `Last changed ${when} by ${hours.updatedBy}` : `Last changed ${when}`;
	});

	async function load() {
		loading = true;
		loadError = "";
		try {
			const data = await getVenueDetails();
			hours = data.openingHours;
			website = data.website;
			days = data.openingHours?.days ?? blankWeek();
		} catch (err) {
			loadError = err instanceof Error ? err.message : "Could not load the venue details.";
		} finally {
			loading = false;
		}
	}

	onMount(() => void load());

	function openDay(key: DayKey) {
		const day = days.find((row) => row.day === key);
		draftClosed = Boolean(day?.closed);
		draftOpens = day?.opens || "";
		draftCloses = day?.closes || "";
		dialogError = "";
		editing = key;
	}

	function closeDialog() {
		if (saving) return;
		editing = null;
	}

	async function send(week: OpeningDay[]) {
		saving = true;
		try {
			const result = await saveOpeningHours(week);
			hours = result.openingHours;
			website = result.website;
			days = result.openingHours?.days ?? week;
			editing = null;
			toast.ok(savedMessage(result));
			for (const warning of result.warnings || []) toast.error(warning);
		} catch (err) {
			dialogError = err instanceof Error ? err.message : "Could not save the hours.";
		} finally {
			saving = false;
		}
	}

	async function saveDay(event: Event) {
		event.preventDefault();
		if (!draft) return;
		const problem = dayProblem(draft);
		if (problem) {
			dialogError = problem;
			return;
		}
		const week = withDay(days, draft);
		// Before the first save the rest of the week may still be blank: keep
		// this day on the page until every day is set.
		if (Object.keys(validateWeek(week).problems).length) {
			days = week;
			editing = null;
			toast.info("Set the rest of the week, then it goes on the website.");
			return;
		}
		await send(week);
	}

	const columnDefs: ColDef<DayRow>[] = [
		{ headerName: "Day", field: "name", flex: 1, minWidth: 140, sortable: false },
		{
			headerName: "Hours",
			field: "label",
			flex: 2,
			minWidth: 220,
			sortable: false,
			cellClass: (params) => (params.data?.closed ? "muted" : ""),
		},
		{
			...ROW_ACTION_COLUMN,
			colId: "edit",
			cellRenderer: svelteCell(RowAction, (params: ICellRendererParams<DayRow>) => ({
				label: `Change ${params.data?.name || "this day"}`,
				icon: "pen",
				tone: "neutral",
				onclick: () => params.data && openDay(params.data.day),
			})),
		},
	];
</script>

<div class="page scrollbar-fade">
	<PageHeader title="Venue details" subtitle="What the website says about the place. Saving puts it on the website." />

	{#if loadError}
		<EmptyState tone="error" title="Could not load the venue details" text={loadError}>
			{#snippet action()}
				<Button variant="outline" size="sm" onclick={() => void load()}>{#snippet icon()}<Icon name="refresh" size={14} />{/snippet}Try again</Button>
			{/snippet}
		</EmptyState>
	{:else if loading && !hours}
		<Skeleton rows={7} lines={1} label="Loading opening hours…" />
	{:else}
		<div class="cards" in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
			<Card title="Opening hours" subtitle="London time. A late close past midnight is fine: Saturday 4pm to 1am.">
				{#snippet actions()}
					<Badge tone={badge.tone} label={badge.label} title={badge.hint} />
				{/snippet}
				{#if phone.matches}
					<ul class="days">
						{#each rows as row (row.day)}
							<li>
								<button type="button" class="day" onclick={() => openDay(row.day)}>
									<span class="day-name">{row.name}</span>
									<span class="day-hours" class:muted={row.closed}>{row.label}</span>
									<span class="day-chevron" aria-hidden="true"><Icon name="chevron-right" size={16} /></span>
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<div class="host">
						<DataGrid
							rowData={rows}
							{columnDefs}
							getRowId={(row) => row.day}
							domLayout="autoHeight"
							onRowClicked={(row) => openDay(row.day)}
						/>
					</div>
				{/if}
				{#snippet footer()}
					<p class="meta">{hours ? changedLine : "Not saved yet: set every day and the website shows them."}</p>
				{/snippet}
			</Card>
		</div>
	{/if}

	<BusyOverlay active={loading && Boolean(hours)} label="Loading…" />
</div>

<Dialog open={editing != null} sheet={phone.matches} title={editing ? DAY_NAMES[editing] : "Day"} onclose={closeDialog}>
	<form id="day-form" class="day-form" novalidate onsubmit={saveDay}>
		<Switch bind:checked={draftClosed} label="Closed all day" onchange={() => (dialogError = "")} />
		<div class="times">
			<Field label="Opens" for="day-opens" width="sm">
				<TimeField id="day-opens" bind:value={draftOpens} disabled={draftClosed} suggest="17:00" placeholder="e.g. 5pm" />
			</Field>
			<Field label="Closes" for="day-closes" width="sm">
				<TimeField id="day-closes" bind:value={draftCloses} disabled={draftClosed} suggest="23:00" placeholder="e.g. 11pm" />
			</Field>
		</div>
		<p class="note" class:late={lateClose && !draftClosed}>
			{#if draftClosed}
				Closed all day. The website says so.
			{:else if lateClose}
				Closes after midnight, in the early hours of {nextDayName}.
			{:else}
				A close after midnight (before 6am) counts as the next morning.
			{/if}
		</p>
		{#if dialogError}<p class="error" role="alert">{dialogError}</p>{/if}
	</form>
	{#snippet footer()}
		<Button variant="ghost" size="sm" type="button" disabled={saving} onclick={closeDialog}>
			{#snippet icon()}<Icon name="close" size={14} />{/snippet}
			Cancel
		</Button>
		<Button variant="primary" size="sm" type="submit" form="day-form" busy={saving}>
			{#snippet icon()}<Icon name="save" size={14} />{/snippet}
			Save
		</Button>
	{/snippet}
</Dialog>

<style>
	.page {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gutter);
	}

	.cards {
		display: grid;
		gap: var(--space-4);
		max-width: 48rem;
	}

	.host {
		--grid-bg: transparent;
		--grid-head-bg: transparent;
		width: 100%;
		min-width: 0;
	}

	.host :global(.ag-root-wrapper) {
		--ag-background-color: var(--card);
	}

	.host :global(.muted),
	.muted {
		color: var(--muted-foreground);
	}

	.meta {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}

	.days {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.days li + li {
		border-top: 1px solid var(--border);
	}

	.day {
		display: grid;
		grid-template-columns: 6.5rem minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		min-height: 3rem;
		margin: 0;
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.day-name {
		font-weight: 600;
	}

	.day-hours {
		font-size: var(--text-sm);
	}

	.day-chevron {
		color: var(--muted-foreground);
	}

	.day-form {
		display: grid;
		gap: var(--space-4);
	}

	.times {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 10rem));
		gap: var(--space-4);
	}

	.note {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}

	.note.late {
		color: var(--text-base);
	}

	.error {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--danger);
	}
</style>
