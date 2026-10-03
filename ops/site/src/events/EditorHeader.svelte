<script lang="ts">
	import { Icon } from "../app/shell";
	import { Button, PageHelp } from "../ui";
	import type { OpsEvent } from "../app/api";
	import { eventItemPath } from "../app/nav";
	import { eventHeaderFlag } from "./event-header-status";
	import { formatDate, repeatLabel } from "./event-labels";
	import { EVENTS_HELP } from "./events-help";
	import {
		lockedReadout as lockedReadoutOf,
		type EventForm,
		type SeriesTextKey,
	} from "./event-form.svelte";
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
		onusedefaults,
		onaddnight,
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
		onusedefaults: () => void;
		onaddnight: () => void;
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
		eventHeaderFlag(current?.publish, dirty, {
			job: websiteJobFor(current?.id)?.state ?? null,
		}),
	);
	const liveCurrent = $derived(current?.publish.live === "current");
	// Event pages render on request (#25): on the website means live now.
	const pageUrl = $derived(
		current?.slug
			? `${getSitePendingState().urls.live}/whats-on/${current.slug}${occurrenceDate ? `/${occurrenceDate}` : ""}`
			: "",
	);
	const lockedReadout = (key: SeriesTextKey) => lockedReadoutOf(current, key);

	function unlockDefaults() {
		form.defaultsUnlocked = true;
	}
</script>

<header class="panel-head">
	<!-- One wrapping row: when the buttons don't fit beside the status, they
	     drop to their own line instead of overlapping it (#43). -->
	<div class="head-row">
		<div class="type-line">
			{#if editingNight}
				<Icon name="events" size={14} />
			{/if}
			<p class="eyebrow">{typeLine}</p>
			{#if headerFlag.tone === "live" && pageUrl}
				<a
					class="status-flag live"
					href={pageUrl}
					target="_blank"
					rel="noopener"
					title="Open the page on the website">{headerFlag.label} ↗</a
				>
			{:else}
				<p class="status-flag {headerFlag.tone}">{headerFlag.label}</p>
			{/if}
		</div>
		<div class="head-tools">
			<div class="toolbar-actions">
				{#if editingOccurrence}
					<Button
						variant="accent"
						size="sm"
						type="button"
						disabled={busy}
						aria-label={form.defaultsUnlocked ? "Use series defaults" : "Override defaults"}
						title={form.defaultsUnlocked ? "Use series defaults" : "Override defaults"}
						onclick={() =>
							form.defaultsUnlocked ? onusedefaults() : unlockDefaults()}
					>
						{#snippet icon()}
							<Icon name={form.defaultsUnlocked ? "undo" : "lock"} />
						{/snippet}
					</Button>
					<span class="tool-sep" aria-hidden="true"></span>
				{/if}
				{#if eventId && !isNew && !editingOccurrence && !editingOnce}
					<Button
						variant="outline"
						size="sm"
						type="button"
						disabled={busy}
						title="Add a night to this series."
						onclick={onaddnight}
					>
						{#snippet icon()}
							<Icon name="plus" size={16} />
						{/snippet}
						Add night
					</Button>
				{/if}
				{#if eventId && !isNew}
					<Button
						variant="outline"
						size="sm"
						type="button"
						disabled={busy || dirty}
						busy={calendarSyncing}
						title={
							dirty
								? "Save before updating the calendar."
								: "Send the upcoming nights for this series to Google Calendar."
						}
						onclick={() => onsynccalendar()}
					>
						Update calendar
					</Button>
					{#if !liveCurrent}
						<Button
							variant="primary"
							size="sm"
							type="button"
							disabled={busy || dirty}
							title={dirty ? "Save first." : "Put this version of the event on gwenda.co.uk."}
							onclick={onputonwebsite}
						>
							Update website
						</Button>
					{/if}
				{/if}
				<PageHelp title="Events" topics={EVENTS_HELP} />
				<Button
					variant="ghost"
					size="sm"
					type="button"
					disabled={busy || !eventId}
					title="Reload"
					aria-label="Reload from server"
					onclick={onreload}
				>
					{#snippet icon()}
						<Icon name="refresh" />
					{/snippet}
				</Button>
				<Button
					class="close-btn"
					variant="ghost"
					size="sm"
					type="button"
					aria-label={dirty ? "Close with unsaved changes" : "Close"}
					title={dirty ? "Close (unsaved)" : "Close"}
					onclick={onclose}
				>
					{#snippet icon()}
						<Icon name="close" size={16} />
					{/snippet}
				</Button>
			</div>
		</div>
	</div>
	<div class="title-name">
		{#if editingNight}
			<div class="name-line">
				<p class="night-headline">
					{headerDate === "No date" ? "Pick a date" : headerDate}
				</p>
			</div>
			{#if editingOccurrence && !form.defaultsUnlocked}
				<p class="locked-title">{lockedReadout("name")}</p>
			{:else}
				<input
					class="title-input night-title"
					id="event-name"
					required={!creatingNight && !editingOccurrence}
					autocomplete="off"
					aria-label="Night title"
					placeholder={creatingNight ? "Night title (optional)" : "Night title"}
					bind:value={form.name}
				/>
			{/if}
		{:else}
			<div class="name-line">
				<input
					class="title-input"
					id="event-name"
					required
					autocomplete="off"
					aria-label={creatingOnce || editingOnce ? "Event name" : "Series name"}
					placeholder={creatingOnce || editingOnce ? "Event name" : "Series name"}
					bind:value={form.name}
				/>
			</div>
		{/if}
		{#if (!editingOccurrence || form.defaultsUnlocked) && form.artist.trim()}
			<p class="sub">{form.artist.trim()}</p>
		{/if}
	</div>
	{#if showHeaderDate}
		<div class="title-meta">
			<p class="date-readout" class:muted={headerDate === "No date"}>{headerDate}</p>
		</div>
	{/if}
	{#if editingNight}
		<p class="head-note">
			{#if parentSeriesName}<span>Part of {parentSeriesName}.</span>{/if}
			<span>
				{#if editingOccurrence && !form.defaultsUnlocked}
					Times, flyer, and copy come from the series.
				{:else}
					Changes apply to this night only.
				{/if}
			</span>
			{#if editingOccurrence && eventId}
				<a class="series-link" href={eventItemPath(eventId)}>Edit series</a>
			{/if}
		</p>
	{:else if isNew && !creatingOnce}
		<div class="create-mode">
			<p class="create-hint muted">
				Pick a series below to add a night, or leave it empty for a new series.
			</p>
		</div>
	{:else if creatingOnce}
		<div class="create-mode">
			<p class="create-hint muted">
				Pick a series below to add a night to it, or leave it on "No series" for a special event.
			</p>
		</div>
	{:else if !editingOnce}
		<p class="head-note">Series defaults, shared by its nights.</p>
	{/if}
	{#if localOps && eventId}
		<p class="head-note local-note">
			Test copy of ops: Save and Update website change the Gwenda Dev copy of the website,
			never gwenda.co.uk.
		</p>
	{/if}
</header>

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

	.panel-head {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: start;
		column-gap: var(--space-3);
		row-gap: 0.2rem;
		flex-shrink: 0;
		padding: 0.55rem var(--card-pad-lg) 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.head-row {
		grid-column: 1 / -1;
		grid-row: 1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-1) var(--space-3);
		min-width: 0;
	}

	.type-line {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		max-width: 100%;
		min-height: var(--control-h-sm);
	}

	.eyebrow {
		min-width: 0;
		margin: 0;
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.head-tools {
		display: flex;
		align-items: center;
		margin-left: auto;
		max-width: 100%;
	}

	.toolbar-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-1);
		min-height: var(--control-h-sm);
	}

	.tool-sep {
		width: 1px;
		height: 1rem;
		margin: 0 0.15rem;
		background: var(--border);
	}

	.head-tools :global(.close-btn) {
		color: var(--muted-foreground);
	}

	.head-tools :global(.close-btn:hover:not(:disabled)) {
		color: var(--destructive);
		background: var(--destructive-wash);
	}

	.title-name {
		grid-column: 1;
		grid-row: 2;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.15rem;
		min-width: 0;
	}

	.name-line {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-3);
		min-width: 0;
	}

	.name-line .title-input {
		flex: 0 1 auto;
		width: auto;
		min-width: min(100%, 10rem);
		max-width: 100%;
		field-sizing: content;
	}

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

	.title-input {
		display: block;
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		padding: 0.08em 0.35rem 0.22em;
		margin: 0 -0.35rem;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--foreground);
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		font-weight: 600;
		letter-spacing: var(--tracking-2xl);
		line-height: 1.3;
		outline: none;
		transition:
			border-color var(--t-fast) var(--ease-in-out),
			background-color var(--t-fast) var(--ease-in-out),
			box-shadow var(--t-fast) var(--ease-in-out);
	}

	.title-input::placeholder {
		color: var(--subtle-foreground);
		font-family: var(--font);
		font-size: var(--text-md);
		font-weight: 400;
		letter-spacing: 0;
	}

	.name-line .title-input:placeholder-shown {
		min-width: min(100%, 20rem);
		border-color: var(--border);
	}

	.title-input:hover {
		border-color: var(--border);
	}

	.title-input:focus {
		border-color: var(--ring);
		background: var(--sunken);
		box-shadow: 0 0 0 2px var(--ring-wash);
	}

	.title-input.night-title {
		font-size: var(--text-md);
		font-weight: 500;
		letter-spacing: 0;
	}

	.title-meta {
		grid-column: 2;
		grid-row: 2;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		justify-self: stretch;
		gap: 0.08rem;
		padding-top: 0.12rem;
		min-width: 0;
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

	.status-flag {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		width: fit-content;
		margin: 0;
		padding: 0.18rem var(--space-2);
		border-radius: var(--radius-pill);
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		line-height: 1.2;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.status-flag.unpublished {
		color: var(--primary-foreground);
		background: var(--primary);
	}

	.status-flag.unsaved {
		color: var(--destructive-foreground);
		background: var(--destructive);
	}

	.status-flag.preview {
		color: var(--foreground);
		background: var(--primary-wash-strong);
	}

	.status-flag.live {
		color: var(--primary);
		background: var(--primary-wash);
		text-decoration: none;
	}

	a.status-flag.live:hover {
		background: var(--primary-wash-strong);
	}

	.status-flag.new {
		color: var(--foreground);
		background: var(--muted);
		box-shadow: inset 0 0 0 1px var(--border-strong);
	}

	.status-flag.muted {
		color: var(--muted-foreground);
		font-weight: 500;
		text-transform: none;
		padding: 0;
		background: transparent;
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

	.create-mode {
		grid-column: 1 / -1;
		display: grid;
		gap: var(--space-2);
		margin-top: var(--space-1);
	}

	.create-hint {
		margin: 0;
		font-size: var(--text-xs);
		line-height: 1.4;
	}

	.create-hint.muted {
		color: var(--muted-foreground);
	}

	.sub {
		margin: 0;
		font-size: var(--text-base);
		color: var(--muted-foreground);
	}

	@media (max-width: 900px) {
		.head-tools :global(.close-btn), .head-tools :global(.photo-expand) {
			display: none;
		}

		.head-note {
			grid-row: 3;
		}

		.panel-head {
			padding-left: max(var(--page-gutter), 1.125rem);
			padding-right: max(var(--page-gutter), 1.125rem);
		}
	}

	@media (max-width: 600px) {
		.title-input, .date-readout, .night-headline {
			font-size: var(--text-xl);
			letter-spacing: var(--tracking-xl);
		}

		.title-input.night-title {
			font-size: var(--text-md);
		}
	}
</style>
