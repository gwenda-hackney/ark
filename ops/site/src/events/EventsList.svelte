<script lang="ts">
	/**
	 * The events lists: Schedule (list or calendar) and Series, with their
	 * search and filters. The page keeps it mounted under the editor so the
	 * week list keeps its scroll position.
	 */
	import { fly } from "svelte/transition";
	import { Icon } from "../app/shell";
	import {
		Button,
		MultiSelect,
		PageHeader,
		PageHelp,
		SearchField,
		Segmented,
		TextField,
	} from "../ui";
	import type { SegmentedItem } from "../ui/types";
	import { easeOut, flyMs } from "../ui/motion";
	import type { OpsEvent } from "../app/api";
	import { eventItemPath, navigate } from "../app/nav";
	import { EVENTS_HELP } from "./events-help";
	import ScheduleCalendar from "./ScheduleCalendar.svelte";
	import ScheduleListGrid from "./ScheduleListGrid.svelte";
	import SeriesGrid from "./SeriesGrid.svelte";
	import {
		compareSeriesByWeekday,
		countEventScheduleRows,
		currentScheduleMonth,
		filterEventSchedule,
		formatScheduleDate,
		formatScheduleWeekday,
		groupEventSchedule,
		scheduleToday,
		seriesWeekdayLabel,
	} from "./event-schedule";
	import {
		formatDate,
		repeatLabel,
		seriesBlurb,
		seriesGuestLabel,
		seriesNextCell,
		seriesOfferLabel,
		seriesTimeLabel,
		statusLabel,
		statusTone,
	} from "./event-labels";

	let {
		events,
		listView,
		listTitle,
		busy,
		error,
		loading,
		editing,
		missing,
		onreload,
	}: {
		events: OpsEvent[];
		listView: "schedule" | "series";
		listTitle: string;
		busy: boolean;
		error: string;
		loading: boolean;
		editing: boolean;
		missing: boolean;
		onreload: () => void;
	} = $props();

	let seriesQuery = $state("");

	let scheduleEventIds = $state<string[]>([]);

	let scheduleQuery = $state("");

	let scheduleFrom = $state("");

	let scheduleTo = $state("");

	const SCHEDULE_VIEW_KEY = "ops.events.scheduleView";

	function readScheduleView(): string {
		try {
			return localStorage.getItem(SCHEDULE_VIEW_KEY) === "calendar" ? "calendar" : "list";
		} catch {
			return "list";
		}
	}

	let scheduleView = $state(readScheduleView());

	let calendarMonth = $state(currentScheduleMonth());

	const scheduleTodayIso = scheduleToday();

	const scheduleViewItems: SegmentedItem[] = [
		{ id: "list", label: "List" },
		{ id: "calendar", label: "Calendar" },
	];

	const schedule = $derived(groupEventSchedule(events));

	const eventFilterOptions = $derived(
		[...events]
			.filter((event) => event.repeatUnit !== "once")
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((event) => ({ value: event.id, label: event.name })),
	);

	const filteredSchedule = $derived(
		filterEventSchedule(schedule, {
			eventIds: scheduleEventIds,
			query: scheduleQuery,
			from: scheduleFrom,
			to: scheduleTo,
		}),
	);

	const visibleSchedule = $derived(filteredSchedule);

	const filteredSeries = $derived.by(() => {
		const q = seriesQuery.trim().toLowerCase();
		return [...events]
			.filter((event) => event.repeatUnit !== "once")
			.filter((event) => {
				if (!q) return true;
				const hay = [
					event.name,
					event.artist,
					event.offer,
					event.shortDescription,
					event.description,
					...(event.nightSchedule || []).map((slot) => slot.label),
				]
					.join(" ")
					.toLowerCase();
				return hay.includes(q);
			})
			.sort(compareSeriesByWeekday);
	});

	const seriesFiltersActive = $derived(Boolean(seriesQuery.trim()));

	const scheduleFiltersActive = $derived(
		scheduleEventIds.length > 0 ||
			Boolean(scheduleQuery.trim()) ||
			Boolean(scheduleFrom) ||
			Boolean(scheduleTo),
	);

	const filtersActive = $derived(
		listView === "schedule" ? scheduleFiltersActive : seriesFiltersActive,
	);

	const seriesRows = $derived.by(() =>
		filteredSeries.map((event) => {
			const time = seriesTimeLabel(event);
			const guest = seriesGuestLabel(event);
			const next = seriesNextCell(event);
			const offer = seriesOfferLabel(event);
			return {
				id: event.id,
				href: eventItemPath(event.id),
				when: seriesWeekdayLabel(event) || repeatLabel(event),
				photo: event.mainImage?.url || "",
				name: event.name,
				blurb: seriesBlurb(event),
				detail: [time, guest, next, offer].filter(Boolean).join(" · "),
				time,
				guest,
				next,
				offer,
				status: statusLabel(event),
				tone: statusTone(event),
			};
		}),
	);

	const scheduleRows = $derived.by(() =>
		visibleSchedule.flatMap((week) => [
			{ kind: "week" as const, id: `week:${week.start}`, label: week.label },
			...week.rows.map((occurrence) => {
				const artist =
					occurrence.occurrence?.overrides.artist || occurrence.event.artist || "";
				const when =
					occurrence.event.repeatUnit === "once"
						? formatDate(occurrence.date)
						: repeatLabel(occurrence.event);
				return {
					kind: "night" as const,
					id: `${occurrence.event.id}:${occurrence.occurrence?.id || occurrence.date}`,
					href:
						occurrence.event.repeatUnit === "once"
							? eventItemPath(occurrence.event.id)
							: eventItemPath(`${occurrence.event.id}@${occurrence.date}`),
					weekday: formatScheduleWeekday(occurrence.date),
					dayDate: formatScheduleDate(occurrence.date),
					photo:
						occurrence.occurrence?.overrides.image?.url ||
						occurrence.event.mainImage?.url ||
						"",
					name: occurrence.occurrence?.overrides.name || occurrence.event.name,
					meta: artist ? `${artist} · ${when}` : when,
					status: statusLabel(occurrence.event),
					tone: statusTone(occurrence.event),
				};
			}),
		]),
	);

	function clearListFilters() {
		if (listView === "schedule") {
			scheduleEventIds = [];
			scheduleQuery = "";
			scheduleFrom = "";
			scheduleTo = "";
			return;
		}
		seriesQuery = "";
	}

	$effect(() => {
		const view = scheduleView === "calendar" ? "calendar" : "list";
		try {
			localStorage.setItem(SCHEDULE_VIEW_KEY, view);
		} catch {
			/* Private browsing can block storage. The toggle still works. */
		}
	});

	let appliedScheduleFrom = "";
	$effect(() => {
		const from = scheduleFrom;
		if (from === appliedScheduleFrom) return;
		appliedScheduleFrom = from;
		if (/^\d{4}-\d{2}-\d{2}$/.test(from)) calendarMonth = from.slice(0, 7);
	});
</script>

<div
	class="list-page scrollbar-fade"
	class:parked={editing || missing}
	inert={editing || missing ? true : undefined}
	aria-hidden={editing || missing ? true : undefined}
>
		<PageHeader title={listTitle}>
			{#snippet actions()}
				{#if listView === "schedule"}
					<Segmented
						bind:value={scheduleView}
						items={scheduleViewItems}
						size="sm"
						ariaLabel="Schedule layout"
					/>
				{/if}
				<PageHelp title={listTitle} topics={EVENTS_HELP} />
				<Button
					type="button"
					variant="outline"
					disabled={busy}
					onclick={() => void onreload()}
				>
					{#snippet icon()}
						<Icon name="refresh" size={16} />
					{/snippet}
					Refresh
				</Button>
				{#if listView === "series"}
					<Button type="button" disabled={busy} onclick={() => navigate("/events/new")}>
						{#snippet icon()}
							<Icon name="plus" size={16} />
						{/snippet}
						New series
					</Button>
				{:else}
					<Button type="button" disabled={busy} onclick={() => navigate("/events/new/once")}>
						{#snippet icon()}
							<Icon name="plus" size={16} />
						{/snippet}
						New event
					</Button>
				{/if}
			{/snippet}
		</PageHeader>
		{#if error && !editing && !missing}<p class="error">{error}</p>{/if}
		{#if events.length || (!error && !loading)}
			<div class="list-filters">
				<div class="filter-search">
					<span class="filter-label">Search</span>
					{#if listView === "series"}
						<SearchField
							bind:value={seriesQuery}
							placeholder="Series name…"
							ariaLabel="Search series"
							count={seriesQuery.trim() ? filteredSeries.length : undefined}
							width="100%"
						/>
					{:else}
						<SearchField
							bind:value={scheduleQuery}
							placeholder="Name, artist, offer…"
							ariaLabel="Search nights"
							count={scheduleQuery.trim()
								? countEventScheduleRows(filteredSchedule)
								: undefined}
							width="100%"
						/>
					{/if}
				</div>
				{#if listView === "schedule"}
					<div class="filter-events">
						<label class="filter-label" for="event-filter">Series name</label>
						<MultiSelect
							id="event-filter"
							size="sm"
							bind:value={scheduleEventIds}
							options={eventFilterOptions}
							placeholder="All series"
						/>
					</div>
					<div class="filter-dates">
						<label class="filter-label" for="event-from">From</label>
						<TextField id="event-from" size="sm" type="date" bind:value={scheduleFrom} />
					</div>
					<div class="filter-dates">
						<label class="filter-label" for="event-to">To</label>
						<TextField id="event-to" size="sm" type="date" bind:value={scheduleTo} />
					</div>
				{/if}
				<button
					type="button"
					class="filter-clear"
					disabled={!filtersActive}
					onclick={clearListFilters}
				>
					Clear
				</button>
			</div>
			<div class="list-main fill">
			{#if listView === "series"}
				{#if seriesRows.length}
					<div class="grid-host" in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
						<SeriesGrid rows={seriesRows} />
					</div>
				{:else}
					<p class="empty">
						{filtersActive ? "No series match these filters." : "No series yet."}
					</p>
				{/if}
			{:else if scheduleView === "calendar"}
				<div class="calendar-host" in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
					<ScheduleCalendar
						weeks={visibleSchedule}
						bind:month={calendarMonth}
						today={scheduleTodayIso}
						filtersActive={scheduleFiltersActive}
					/>
				</div>
			{:else if scheduleRows.length}
				<div class="grid-host" in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
					<ScheduleListGrid rows={scheduleRows} />
				</div>
			{:else}
				<p class="empty">
					{filtersActive ? "No nights match these filters." : "No upcoming nights."}
				</p>
			{/if}
			</div>
		{/if}
	</div>

<style>
	.list-page {
		position: absolute;
		inset: 0;
		z-index: 0;
		overflow: hidden;
		padding: var(--page-gutter);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		background: var(--background);
	}

	.list-main {
		flex: 1;
		min-height: 0;
		min-width: 0;
		overflow: auto;
	}

	.list-main.fill {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.grid-host,
	.calendar-host {
		flex: 1;
		min-height: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.list-page.parked {
		/* Keep the list laid out and scrolled under the detail. */
		pointer-events: none;
	}

	/* Wraps instead of running off the edge when the page is narrower than
	   the five filters (#32). */
	.list-filters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		align-items: flex-end;
	}

	.filter-search {
		flex: 1 1 12rem;
		min-width: 0;
	}

	.filter-events {
		flex: 0 1 14rem;
		min-width: 0;
	}

	.filter-dates {
		flex: 0 1 9.5rem;
		min-width: 0;
	}

	.filter-search :global(.wrap) {
		height: var(--control-h-sm);
	}

	.filter-label {
		display: block;
		margin: 0 0 var(--space-1);
		color: var(--muted-foreground);
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
	}

	.filter-clear {
		align-self: end;
		height: var(--control-h-sm);
		padding: 0 var(--space-3);
		border: 0;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}

	.filter-clear:hover:not(:disabled) {
		color: var(--foreground);
		background: var(--accent);
	}

	.filter-clear:disabled {
		opacity: 0;
		pointer-events: none;
	}

	@media (max-width: 720px) {
		.list-filters {
			display: grid;
			grid-template-columns: 1fr 1fr;
		}

		.filter-search,
		.filter-events {
			grid-column: 1 / -1;
		}
	}

	.empty {
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.error {
		margin: 0;
		color: var(--destructive);
	}
</style>
