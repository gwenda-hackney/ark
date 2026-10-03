<script lang="ts">
	import { Icon } from "../app/shell";
	import { Badge, Button, PageHelp } from "../ui";
	import { editorHeaderActions } from "./editor-header-actions";
	import type { OpsEvent } from "../app/api";
	import { eventItemPath } from "../app/nav";
	import { eventHeaderFlag } from "./event-header-status";
	import { formatDate, repeatLabel } from "./event-labels";
	import { EVENTS_HELP } from "./events-help";
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
	const title = $derived(
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

<header class="panel-head">
	<!-- One wrapping row: when the buttons don't fit beside the status, they
	     drop to their own line instead of overlapping it (#43). -->
	<div class="head-row">
		<div class="type-line">
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
		</div>
		<div class="head-tools">
			<div class="toolbar-actions">
				<!-- Always the same buttons in the same places; ones that don't apply
				     are disabled with a reason rather than hidden. -->
				<Button
					variant="outline"
					size="sm"
					data-compact
					aria-label="Add night"
					disabled={actions.addNight.disabled}
					reason={actions.addNight.reason}
					title="Add a night to this series."
					onclick={onaddnight}
				>
					{#snippet icon()}
						<Icon name="plus" size={14} />
					{/snippet}
					Add night
				</Button>
				<Button
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
				<PageHelp title="Events" topics={EVENTS_HELP} />
				<Button
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
						<Icon name="close" size={14} />
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
			{#if nightTitle}
				<p class="locked-title">{nightTitle}</p>
			{/if}
		{:else}
			<div class="name-line">
				<h1 class="title-text" class:placeholder={!form.name.trim()}>{title}</h1>
			</div>
			{#if form.artist.trim()}
				<p class="sub">{form.artist.trim()}</p>
			{/if}
		{/if}
	</div>
	{#if showHeaderDate}
		<div class="title-meta">
			<p class="date-readout" class:muted={headerDate === "No date"}>{headerDate}</p>
		</div>
	{/if}
	{#if editingOccurrence}
		<p class="head-note">
			{#if parentSeriesName}<span>Part of {parentSeriesName}.</span>{/if}
			<span>Anything marked From series follows the series until you override it.</span>
			{#if eventId}
				<a class="series-link" href={eventItemPath(eventId)}>Edit series</a>
			{/if}
		</p>
	{:else if !isNew && !editingOnce && !editingNight}
		<p class="head-note">Its nights take these details unless a night overrides them.</p>
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

	.title-text {
		margin: 0;
		min-width: 0;
		color: var(--foreground);
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		font-weight: 600;
		letter-spacing: var(--tracking-2xl);
		line-height: 1.3;
		overflow-wrap: anywhere;
	}

	.title-text.placeholder {
		color: var(--muted-foreground);
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

	.sub {
		margin: 0;
		font-size: var(--text-base);
		color: var(--muted-foreground);
	}

	@media (max-width: 900px) {
		.head-tools :global(.close-btn), .head-tools :global(.photo-expand) {
			display: none;
		}

		/* One row in a fixed order: scroll sideways rather than wrap. */
		.head-tools {
			width: 100%;
			margin-left: 0;
		}

		.toolbar-actions {
			flex-wrap: nowrap;
			justify-content: flex-start;
			margin: -2px;
			padding: 2px;
			overflow-x: auto;
			scrollbar-width: none;
		}

		.toolbar-actions::-webkit-scrollbar {
			display: none;
		}

		/* Secondary buttons and Help shrink to their icon so Update website fits. */
		.toolbar-actions :global(.btn[data-compact]) {
			width: var(--control-h);
			height: var(--control-h);
			padding: 0;
		}

		.toolbar-actions :global(.btn[data-compact] .label) {
			position: absolute;
			width: 1px;
			height: 1px;
			margin: -1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
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
		.title-text, .date-readout, .night-headline {
			font-size: var(--text-xl);
			letter-spacing: var(--tracking-xl);
		}
	}
</style>
