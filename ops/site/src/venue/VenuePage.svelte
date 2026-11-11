<script lang="ts">
	/**
	 * Settings → Venue details (#240): what the website says about the place.
	 * Two cards: the opening hours, and the party facts the party page shows
	 * (how many fit, what's included, how soon we reply; any of them blank).
	 * A day opens the same editor everywhere: a dialog on desktop, a sheet on
	 * phones. Saving either card puts the venue's details on the website by
	 * itself, as saving an event does (venue/server/venue-website.js).
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
		NumberField,
		PageHeader,
		RowAction,
		Skeleton,
		Switch,
		TextArea,
		TextField,
		TimeField,
	} from "../ui";
	import { ROW_ACTION_COLUMN, svelteCell } from "../ui/grid";
	import { getVenueDetails, saveOpeningHours, saveParties as putParties } from "../app/api";
	import { toast } from "../ui/toast.svelte";
	import { easeOut, flyMs } from "../ui/motion";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../ui/viewport.svelte";
	import { DAY_NAMES, DAYS, closesAfterMidnight, dayHoursLabel, dayProblem, validateWeek } from "./hours-model.js";
	import { INCLUDED_MAX_LINES, partyFacts, validateParties } from "./parties-model.js";
	import { blankWeek, partiesChanged, partyForm, savedMessage, websiteBadge, withDay } from "./venue-page";
	import type { DayKey, OpeningDay, OpeningHours, Parties, PartyField, PartyForm, WebsiteState } from "./types";

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

	/** The party facts as saved (null: never), and as typed. */
	let parties = $state<Parties | null>(null);
	let partyFields = $state<PartyForm>(partyForm(null));
	let partyErrors = $state<Partial<Record<PartyField, string>>>({});
	let partySaveError = $state("");
	let savingParties = $state(false);

	const badge = $derived(websiteBadge(website));
	const partiesBadge = $derived(websiteBadge(website, "party details"));
	const partiesDirty = $derived(partiesChanged(partyFields, parties));
	const replyHint = $derived.by(() => {
		const reply = partyFacts(partyFields).replyWithin;
		return reply ? `The party page says “We reply within ${reply}”.` : "A few words, like “a day”.";
	});
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
	function lastChanged(saved: { updatedAt: string; updatedBy: string } | null): string {
		if (!saved?.updatedAt) return "";
		const when = new Date(saved.updatedAt).toLocaleString("en-GB", {
			day: "numeric",
			month: "short",
			hour: "numeric",
			minute: "2-digit",
		});
		return saved.updatedBy ? `Last changed ${when} by ${saved.updatedBy}` : `Last changed ${when}`;
	}
	const changedLine = $derived(lastChanged(hours));
	const partiesChangedLine = $derived(lastChanged(parties));

	async function load() {
		loading = true;
		loadError = "";
		try {
			const data = await getVenueDetails();
			hours = data.openingHours;
			website = data.website;
			days = data.openingHours?.days ?? blankWeek();
			parties = data.parties;
			partyFields = partyForm(data.parties);
			partyErrors = {};
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

	function editParty(field: PartyField) {
		if (partyErrors[field]) partyErrors = { ...partyErrors, [field]: "" };
		partySaveError = "";
	}

	async function sendParties(event: Event) {
		event.preventDefault();
		const { problems } = validateParties(partyFields);
		partyErrors = problems;
		partySaveError = "";
		const first = (["standing", "seated", "included", "replyWithin"] as const).find((field) => problems[field]);
		if (first) {
			document.getElementById(`party-${first}`)?.focus();
			return;
		}
		savingParties = true;
		try {
			const result = await putParties(partyFields);
			parties = result.parties;
			website = result.website;
			partyFields = partyForm(result.parties);
			toast.ok(savedMessage(result, "party details"));
			for (const warning of result.warnings || []) toast.error(warning);
		} catch (err) {
			partySaveError = err instanceof Error ? err.message : "Could not save the party details.";
		} finally {
			savingParties = false;
		}
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
	{:else if loading && !hours && !parties}
		<Skeleton rows={7} lines={1} label="Loading venue details…" />
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

			<Card
				title="Parties"
				subtitle="What the party page tells people before they ask. Leave anything blank and the website leaves it out."
			>
				{#snippet actions()}
					<Badge tone={partiesBadge.tone} label={partiesBadge.label} title={partiesBadge.hint} />
				{/snippet}
				<form id="parties-form" class="parties-form" novalidate onsubmit={sendParties}>
					<div class="capacity">
						<Field label="Standing" for="party-standing" width="sm" error={partyErrors.standing}>
							<NumberField
								id="party-standing"
								bind:value={partyFields.standing}
								integer
								min={1}
								unit="people"
								noun="a number of people"
								example="80"
								oninput={() => editParty("standing")}
							/>
						</Field>
						<Field label="Seated" for="party-seated" width="sm" error={partyErrors.seated}>
							<NumberField
								id="party-seated"
								bind:value={partyFields.seated}
								integer
								min={1}
								unit="people"
								noun="a number of people"
								example="40"
								oninput={() => editParty("seated")}
							/>
						</Field>
					</div>
					<Field
						label="What's included"
						for="party-included"
						error={partyErrors.included}
						hint={`One thing a line, up to ${INCLUDED_MAX_LINES}: no hire fee, a booth held for you, a round on us for big groups.`}
					>
						<TextArea
							id="party-included"
							bind:value={partyFields.included}
							rows={4}
							placeholder={"No hire fee\nA booth held for you"}
							oninput={() => editParty("included")}
						/>
					</Field>
					<Field label="We reply within" for="party-replyWithin" width="md" error={partyErrors.replyWithin} hint={replyHint}>
						<TextField
							id="party-replyWithin"
							bind:value={partyFields.replyWithin}
							placeholder="a day"
							oninput={() => editParty("replyWithin")}
						/>
					</Field>
					{#if partySaveError}<p class="error" role="alert">{partySaveError}</p>{/if}
				</form>
				{#snippet footer()}
					<p class="meta grow">
						{parties ? partiesChangedLine : "Not saved yet: all blank, so the party page leaves them out."}
					</p>
					<Button
						variant="primary"
						size="sm"
						type="submit"
						form="parties-form"
						busy={savingParties}
						disabled={!partiesDirty || savingParties}
					>
						{#snippet icon()}<Icon name="save" size={14} />{/snippet}
						Save
					</Button>
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

	.meta.grow {
		flex: 1;
		min-width: 0;
	}

	.parties-form {
		display: grid;
		gap: var(--space-4);
	}

	.capacity {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 10rem));
		gap: var(--space-4);
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
