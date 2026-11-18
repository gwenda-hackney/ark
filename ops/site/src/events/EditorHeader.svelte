<script lang="ts">
	import { Icon } from "../app/shell";
	import { Badge, Button, EditorCardHeader, PageHelp } from "../ui";
	import { editorHeaderActions } from "./editor-header-actions";
	import type { OpsEvent } from "../app/api";
	import { eventPath } from "./event-lists";
	import { eventHeaderFlag } from "./event-header-status";
	import { formatDate, repeatLabel } from "./event-labels";
	import type { EventForm } from "./event-form.svelte";
	import { websiteJobFor } from "./website-jobs.svelte";
	import { getSitePendingState } from "../website/site-pending.svelte";

	let {
		form,
		current,
		eventId,
		occurrenceDate,
		busy,
		dirty,
		isNew,
		creatingNight,
		creatingOnce,
		editingOnce,
		parentSeriesName,
		calendarSyncing,
		localOps,
		onsynccalendar,
		onputonwebsite,
		onreload,
		onclose,
	}: {
		form: EventForm;
		/** The saved event (null while new). */
		current: OpsEvent | null;
		eventId: string;
		/** Set when editing one night of a series. */
		occurrenceDate: string;
		busy: boolean;
		dirty: boolean;
		isNew: boolean;
		creatingNight: boolean;
		creatingOnce: boolean;
		editingOnce: boolean;
		/** The series a night belongs to, shown under its title. */
		parentSeriesName: string;
		calendarSyncing: boolean;
		/** Local ops: Save and Update website change the Gwenda Dev copy only. */
		localOps: boolean;
		onsynccalendar: () => void;
		onputonwebsite: () => void;
		onreload: () => void;
		onclose: () => void;
	} = $props();

	const editingOccurrence = $derived(Boolean(occurrenceDate));
	const editingNight = $derived(editingOccurrence || creatingNight);
	const showHeaderDate = $derived(creatingOnce || editingOnce);
	const typeLine = $derived.by(() => {
		if (editingNight) return "This night";
		if (creatingOnce || editingOnce) return "Special event";
		if (form.repeatUnit === "none" || form.repeatUnit === "once") return "Series";
		return `Series · ${repeatLabel({
			repeatEvery: Number(form.repeatEvery) || 1,
			repeatUnit: form.repeatUnit as OpsEvent["repeatUnit"],
			weekdays: form.weekdays,
			monthDay: Number(form.monthDay) || 0,
		})}`;
	});
	const headerDate = $derived(
		occurrenceDate
			? formatDate(occurrenceDate)
			: form.startsOn
				? formatDate(form.startsOn)
				: "No date",
	);
	const headerFlag = $derived(
		// Unsaved shows once, in the action bar; this says where it stands on the website.
		eventHeaderFlag(current?.publish, false, {
			job: websiteJobFor(current?.id)?.state ?? null,
		}),
	);
	const liveCurrent = $derived(current?.publish.live === "current");
	const actions = $derived(
		editorHeaderActions({
			eventId,
			isNew,
			editingNight,
			special: creatingOnce || editingOnce,
			dirty,
			busy,
			liveCurrent,
		}),
	);
	// Event pages render on request (#25): on the website means live now.
	const pageUrl = $derived(
		current?.slug
			? `${getSitePendingState().urls.live}/whats-on/${current.slug}${occurrenceDate ? `/${occurrenceDate}` : ""}`
			: "",
	);
	/** The name as typed, or what's being made while it has none. */
	const heading = $derived(
		form.name.trim() ||
			(isNew ? (creatingOnce ? "New special event" : "New series") : "Untitled"),
	);
	/** Under a night's date: its own title, else the series it belongs to. */
	const nightTitle = $derived(
		form.isOverridden("name") && form.name.trim()
			? form.name.trim()
			: parentSeriesName || (creatingNight ? "Choose a series below" : ""),
	);
</script>

{#snippet dateMeta()}
	<p class="date-readout" class:muted={headerDate === "No date"}>{headerDate}</p>
{/snippet}

<EditorCardHeader meta={showHeaderDate ? dateMeta : undefined} {onclose} {dirty}>
	{#snippet kicker()}
		{#if editingNight}
			<Icon name="events" size={14} />
		{/if}
		<p class="eyebrow">{typeLine}</p>
		{#if headerFlag.live && pageUrl}
			<a class="flag-link" href={pageUrl} target="_blank" rel="noopener" title="{headerFlag.title}. Open the page.">
				<Badge tone={headerFlag.tone} label="{headerFlag.label} ↗" />
			</a>
		{:else}
			<Badge tone={headerFlag.tone} label={headerFlag.label} title={headerFlag.title} />
		{/if}
	{/snippet}
	{#snippet tools()}
		<!-- Always the same buttons in the same places; ones that don't apply
		     are disabled with a reason rather than hidden. -->
			<Button
				class="desk-tool"
				variant="outline"
				size="sm"
				data-compact
				aria-label="Update calendar"
				disabled={actions.calendar.disabled}
				reason={actions.calendar.reason}
				busy={calendarSyncing}
				title="Send the upcoming nights for this series to Google Calendar."
				onclick={() => onsynccalendar()}
			>
				{#snippet icon()}
					<Icon name="calendar" size={14} />
	{/snippet}
					Update calendar
				</Button>
				<Button
					variant="primary"
					size="sm"
					disabled={actions.website.disabled}
					reason={actions.website.reason}
					title="Put this version of the event on gwenda.co.uk."
					onclick={onputonwebsite}
				>
					{#snippet icon()}
						<Icon name="upload" size={14} />
					{/snippet}
					Update website
				</Button>
				<span class="desk-tool help-slot"><PageHelp /></span>
				<Button
					class="desk-tool"
					variant="ghost"
					size="sm"
					type="button"
					disabled={actions.reload.disabled}
					reason={actions.reload.reason}
					title="Reload"
					aria-label="Reload from server"
					onclick={onreload}
				>
					{#snippet icon()}
						<Icon name="refresh" size={14} />
					{/snippet}
				</Button>
	{/snippet}
	{#snippet title()}
		{#if editingNight}
			<div class="name-line">
				<p class="night-headline">
					{headerDate === "No date" ? "Pick a date" : headerDate}
				</p>
			</div>
			{#if nightTitle}
				<p class="locked-title">{nightTitle}</p>
			{/if}
		{:else}
			<div class="name-line">
				<h1 class="title-text" class:placeholder={!form.name.trim()}>{heading}</h1>
			</div>
			{#if form.artist.trim()}
				<p class="sub">{form.artist.trim()}</p>
			{/if}
		{/if}
	{/snippet}
	{#snippet notes()}
		{#if editingOccurrence}
		<p class="head-note">
			{#if parentSeriesName}<span>Part of {parentSeriesName}.</span>{/if}
			<span>Anything marked From series follows the series until you override it.</span>
			{#if eventId}
				<a class="series-link" href={eventPath({ id: eventId, category: current?.category })}>Edit series</a>
			{/if}
		</p>
	{:else if !isNew && !editingOnce && !editingNight}
		<p class="head-note series-note">Its nights take these details unless a night overrides them.</p>
	{/if}
	{#if localOps && eventId}
		<p class="head-note local-note">
			Test copy of ops: Save and Update website change the Gwenda Dev copy of the website,
			never gwenda.co.uk.
		</p>
	{/if}
	{/snippet}
</EditorCardHeader>

<style>
	.series-link {
		color: var(--primary);
		font-size: var(--text-xs);
		font-weight: 600;
		text-decoration: none;
		white-space: nowrap;
	}

	.series-link:hover {
		text-decoration: underline;
	}

	/* The card's head is EditorCardHeader; these are an event's own parts of it. */

	.night-headline {
		margin: 0;
		font-family: var(--font);
		font-size: var(--text-2xl);
		letter-spacing: var(--tracking-2xl);
		font-weight: 600;
		line-height: 1.3;
		color: var(--foreground);
	}

	.locked-title {
		margin: 0.15rem 0 0;
		color: var(--foreground);
		font-size: var(--text-md);
		font-weight: 500;
		line-height: 1.3;
	}

	.date-readout {
		margin: 0;
		font-family: var(--font);
		font-size: var(--text-2xl);
		letter-spacing: var(--tracking-2xl);
		font-weight: 600;
		line-height: 1.3;
		color: var(--foreground);
		font-variant-numeric: tabular-nums;
		font-feature-settings: var(--font-features-num);
		white-space: nowrap;
	}

	.date-readout.muted {
		color: var(--muted-foreground);
		font-weight: 500;
		font-size: var(--text-lg);
		letter-spacing: var(--tracking-lg);
	}

	.flag-link {
		display: inline-flex;
		border-radius: var(--radius-sm);
		text-decoration: none;
	}

	.flag-link:hover :global(.badge) {
		border-color: var(--success);
	}

	.flag-link:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.head-note {
		grid-column: 1 / -1;
		grid-row: 3;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		/* A space-sized gap between the sentences, not a wide one (#32). */
		gap: 0.2rem 0.3em;
		margin: 0;
		padding-top: var(--space-2);
		font-size: var(--text-xs);
		font-weight: 500;
		line-height: 1.4;
		color: var(--muted-foreground);
		max-width: 40rem;
	}

	.head-note.local-note {
		grid-row: 4;
		padding-top: 0.2rem;
	}

	@media (max-width: 900px) {
		/* Phones: a shorter header. The fields marked From series say the same. */
		.series-note {
			display: none;
		}
	}

	@media (max-width: 600px) {
		.date-readout, .night-headline {
			font-size: var(--text-xl);
			letter-spacing: var(--tracking-xl);
		}
	}
</style>
