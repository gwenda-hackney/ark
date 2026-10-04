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
		Chip,
		EmptyState,
		FilterBar,
		FilterField,
		DateField,
		MultiSelect,
		PageHeader,
		PageHelp,
		Segmented,
		Skeleton,
	} from "../ui";
	import type { SegmentedItem } from "../ui/types";
	import { activeFilterCount, dateRangeLabel, type FilterChip } from "../ui/filters";
	import { SCHEDULE_RANGES, scheduleRangeDates, type ScheduleRange } from "./schedule-filters";
	import { easeOut, flyMs } from "../ui/motion";
	import type { OpsEvent } from "../app/api";
	import { eventItemPath, navigate } from "../app/nav";
	import ScheduleCalendar from "./ScheduleCalendar.svelte";
	import ScheduleListGrid from "./ScheduleListGrid.svelte";
	import SeriesCards from "./SeriesCards.svelte";
	import { seriesCardRow } from "./series-card";
	import {
		compareSeriesByWeekday,
		countEventScheduleRows,
		currentScheduleMonth,
		filterEventSchedule,
		formatScheduleDate,
		formatScheduleWeekday,
		groupEventSchedule,
		scheduleToday,
	} from "./event-schedule";
	import {
		formatDate,
		repeatLabel,
		statusLabel,
		statusTitle,
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

	const seriesRows = $derived(filteredSeries.map(seriesCardRow));

	const scheduleRows = $derived.by(() =>
		visibleSchedule.flatMap((week) => [
			{ kind: "week" as const, id: `week:${week.start}`, label: week.label, count: week.rows.length },
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
					statusTitle: statusTitle(occurrence.event),
					tone: statusTone(occurrence.event),
				};
			}),
		]),
	);

	/** Quick date choice. Custom keeps whatever From and To say. */
	let scheduleRange = $state<ScheduleRange>("any");

	function pickRange(range: ScheduleRange) {
		scheduleRange = range;
		const dates = scheduleRangeDates(range, scheduleTodayIso);
		if (!dates) return;
		scheduleFrom = dates.from;
		scheduleTo = dates.to;
	}

	const seriesNames = $derived(new Map(eventFilterOptions.map((row) => [row.value, row.label])));

	/** Series and dates count as one filter each; the search is separate. */
	const scheduleFilterCount = $derived(
		activeFilterCount([scheduleEventIds, scheduleFrom || scheduleTo]),
	);

	const scheduleChips = $derived.by((): FilterChip[] => {
		const chips: FilterChip[] = scheduleEventIds.map((id) => ({
			key: `series:${id}`,
			label: seriesNames.get(id) || "Series",
			onremove: () => (scheduleEventIds = scheduleEventIds.filter((row) => row !== id)),
		}));
		const dates = dateRangeLabel(scheduleFrom, scheduleTo);
		if (dates) {
			chips.push({ key: "dates", label: dates, onremove: () => pickRange("any") });
		}
		return chips;
	});

	function clearScheduleFilters() {
		scheduleEventIds = [];
		pickRange("any");
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
				<PageHelp />
				<Button
					type="button"
					variant="outline"
					size="sm"
					data-compact
					disabled={busy}
					busy={loading}
					onclick={() => void onreload()}
				>
					{#snippet icon()}
						<Icon name="refresh" size={16} />
					{/snippet}
					Refresh
				</Button>
				{#if listView === "series"}
					<Button type="button" size="sm" disabled={busy} onclick={() => navigate("/events/new")}>
						{#snippet icon()}
							<Icon name="plus" size={16} />
						{/snippet}
						New series
					</Button>
				{:else}
					<Button type="button" size="sm" disabled={busy} onclick={() => navigate("/events/new/once")}>
						{#snippet icon()}
							<Icon name="plus" size={16} />
						{/snippet}
						New event
					</Button>
				{/if}
			{/snippet}
			{#snippet toolbar()}
				{#if events.length || (!error && !loading)}
					{#if listView === "series"}
						<FilterBar
							bind:query={seriesQuery}
							placeholder="Search series"
							ariaLabel="Search series"
							searchCount={seriesQuery.trim() ? filteredSeries.length : undefined}
						/>
					{:else}
						<FilterBar
							bind:query={scheduleQuery}
							placeholder="Search name, artist, offer"
							ariaLabel="Search nights"
							searchCount={scheduleQuery.trim() ? countEventScheduleRows(filteredSchedule) : undefined}
							active={scheduleFilterCount}
							chips={scheduleChips}
							onclearfilters={clearScheduleFilters}
						>
							{#snippet filters()}
								<FilterField label="Series" for="event-filter">
									<MultiSelect
										id="event-filter"
										size="sm"
										bind:value={scheduleEventIds}
										options={eventFilterOptions}
										placeholder="All series"
									/>
								</FilterField>
								<FilterField label="When">
									{#each SCHEDULE_RANGES as range (range.id)}
										<Chip pressed={scheduleRange === range.id} onclick={() => pickRange(range.id)}>
											{range.label}
										</Chip>
									{/each}
								</FilterField>
								{#if scheduleRange === "custom"}
									<FilterField label="From" for="event-from">
										<DateField id="event-from" size="sm" bind:value={scheduleFrom} />
									</FilterField>
									<FilterField label="To" for="event-to">
										<DateField id="event-to" size="sm" bind:value={scheduleTo} min={scheduleFrom} />
									</FilterField>
								{/if}
							{/snippet}
						</FilterBar>
					{/if}
				{/if}
			{/snippet}
		</PageHeader>
		<div class="list-main fill" class:bleed={listView === "series" && seriesRows.length > 0 && !loading}>
			{#if error && !editing && !missing && !events.length}
				<EmptyState tone="error" title="Could not load events" text={error}>
					{#snippet action()}
						<Button variant="outline" size="sm" onclick={() => void onreload()}>{#snippet icon()}<Icon name="refresh" size={14} />{/snippet}Try again</Button>
					{/snippet}
				</EmptyState>
			{:else if loading && !events.length}
				<Skeleton rows={8} thumb label="Loading events…" />
			{:else}
				{#if error && !editing && !missing}<p class="error">{error}</p>{/if}
				{#if listView === "series"}
					{#if seriesRows.length}
						<div class="grid-host" in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
							<SeriesCards rows={seriesRows} />
						</div>
					{:else if filtersActive}
						<EmptyState icon="search" title="No series match" text="Try another name, or clear the search." />
					{:else}
						<EmptyState icon="events" title="No series yet" text="A series is a regular night, like a weekly residency.">
							{#snippet action()}
								<Button size="sm" onclick={() => navigate("/events/new")}>{#snippet icon()}<Icon name="plus" size={14} />{/snippet}New series</Button>
							{/snippet}
						</EmptyState>
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
				{:else if filtersActive}
					<EmptyState icon="search" title="No nights match" text="Try other filters, or clear them to see every night." />
				{:else}
					<EmptyState icon="events" title="No upcoming nights" text="Nights from your series and special events show here.">
						{#snippet action()}
							<Button size="sm" onclick={() => navigate("/events/new/once")}>{#snippet icon()}<Icon name="plus" size={14} />{/snippet}New event</Button>
						{/snippet}
					</EmptyState>
				{/if}
			{/if}
		</div>
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
		background: transparent;
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

	/* Series cards scroll edge to edge, like the menu's, so the scrollbar sits
	   at the side of the page; SeriesCards puts the gutter back inside. */
	.list-main.bleed {
		margin: 0 calc(-1 * var(--page-gutter)) calc(-1 * var(--page-gutter));
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

	/* Steps back and dims while an editor comes forward over it. */
	.list-page {
		transition:
			transform 440ms var(--ease),
			opacity 440ms var(--ease);
	}

	.list-page.parked {
		transform: scale(0.97);
		opacity: 0.35;
	}

	@media (prefers-reduced-motion: reduce) {
		.list-page {
			transition: none;
		}
	}

	.error {
		margin: 0 0 var(--space-3);
		color: var(--destructive);
		font-size: var(--text-sm);
	}

	/* Phones: the list runs edge to edge, so rows use the full width. */
	@media (max-width: 900px) {
		.list-page {
			padding-bottom: 0;
		}
	}
</style>
