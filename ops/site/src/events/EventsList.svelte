<script lang="ts">
	/**
	 * What's on's lists (#312): the Schedule (a list or a calendar of every
	 * night, with its kind filter and search), or one kind's list, Events,
	 * Pop-ups or Deals, as a list. The page keeps it mounted under the editor
	 * so the week list keeps its scroll position.
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
	import { eventItemPath, eventNewPath, navigate } from "../app/nav";
	import ScheduleCalendar from "./ScheduleCalendar.svelte";
	import ScheduleListGrid from "./ScheduleListGrid.svelte";
	import SeriesListGrid from "./SeriesListGrid.svelte";
	import { seriesCardRow } from "./series-card";
	import { filterByCategory, type CategoryFilter } from "./event-category";
	import { LIST_COPY, SCHEDULE_KINDS, eventPath, sectionEvents, type EventList, type EventSection } from "./event-lists";
	import {
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
		list,
		busy,
		error,
		loading,
		editing,
		missing,
		onreload,
	}: {
		events: OpsEvent[];
		/** The Schedule, or Events, Pop-ups or Deals. */
		list: EventList;
		busy: boolean;
		error: string;
		loading: boolean;
		editing: boolean;
		missing: boolean;
		onreload: () => void;
	} = $props();

	const copy = $derived(LIST_COPY[list]);
	const section = $derived<EventSection | null>(list === "schedule" ? null : list);
	/** Add starts the list's kind; the Schedule's asks what kind first. */
	const addPath = $derived(
		section ? eventNewPath("details", { section }) : eventNewPath("details", { once: true }),
	);

	/** Each kind's list keeps its own search. */
	let sectionQueries = $state<Record<EventSection, string>>({ events: "", popups: "", deals: "" });

	/** The Schedule's kind: everything, or nights, pop-ups or deals only. */
	let kindFilter = $state<string>("all");
	const scheduleEvents = $derived(filterByCategory(events, kindFilter as CategoryFilter));

	let scheduleEventIds = $state<string[]>([]);

	let scheduleQuery = $state("");

	let scheduleFrom = $state("");

	let scheduleTo = $state("");

	const SCHEDULE_VIEW_KEY = "ops.events.scheduleView";

	/** The calendar (its week view) unless they've picked the list. */
	function readScheduleView(): string {
		try {
			return localStorage.getItem(SCHEDULE_VIEW_KEY) === "list" ? "list" : "calendar";
		} catch {
			return "calendar";
		}
	}

	let scheduleView = $state(readScheduleView());

	let calendarMonth = $state(currentScheduleMonth());

	const scheduleTodayIso = scheduleToday();

	const scheduleViewItems: SegmentedItem[] = [
		{ id: "list", label: "List" },
		{ id: "calendar", label: "Calendar" },
	];

	const schedule = $derived(groupEventSchedule(scheduleEvents));

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

	const sectionQuery = $derived(section ? sectionQueries[section].trim().toLowerCase() : "");

	/** The kind's series and its one-offs still to come, then the search. */
	const filteredSection = $derived.by(() => {
		if (!section) return [];
		const q = sectionQuery;
		return sectionEvents(events, section, scheduleTodayIso).filter((event) => {
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
		});
	});

	const scheduleFiltersActive = $derived(
		kindFilter !== "all" ||
			scheduleEventIds.length > 0 ||
			Boolean(scheduleQuery.trim()) ||
			Boolean(scheduleFrom) ||
			Boolean(scheduleTo),
	);

	const filtersActive = $derived(section ? Boolean(sectionQuery) : scheduleFiltersActive);

	const sectionRows = $derived(filteredSection.map(seriesCardRow));

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
							? eventPath(occurrence.event)
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
		<!-- The Schedule's kind filter: in list and calendar alike, so nothing moves when the view or the kind changes. -->
		{#snippet kinds()}
			<Segmented
				bind:value={kindFilter}
				items={SCHEDULE_KINDS}
				tone="soft"
				size="sm"
				ariaLabel="Show events, pop-ups or deals"
			/>
		{/snippet}
		<PageHeader title={copy.title} children={section ? undefined : kinds}>
			{#snippet actions()}
				{#if !section}
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
				<Button type="button" size="sm" disabled={busy} onclick={() => navigate(addPath)}>
					{#snippet icon()}
						<Icon name="plus" size={16} />
					{/snippet}
					Add
				</Button>
			{/snippet}
			{#snippet toolbar()}
				{#if events.length || (!error && !loading)}
					{#if section}
						<FilterBar
							bind:query={sectionQueries[section]}
							placeholder={copy.search}
							ariaLabel={copy.search}
							searchCount={sectionQuery ? filteredSection.length : undefined}
						/>
					{:else}
						<FilterBar
							bind:query={scheduleQuery}
							placeholder={copy.search}
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
		<div class="list-main fill" >
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
				{#if section}
					{#if sectionRows.length}
						<div class="grid-host" in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
							<SeriesListGrid rows={sectionRows} scrollKey={`events-${section}`} />
						</div>
					{:else if filtersActive}
						<EmptyState icon="search" title="Nothing matches" text="Try another name, or clear the search." />
					{:else}
						<EmptyState icon="events" title={copy.emptyTitle} text={copy.emptyText}>
							{#snippet action()}
								<Button size="sm" onclick={() => navigate(addPath)}>{#snippet icon()}<Icon name="plus" size={14} />{/snippet}Add</Button>
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
					<EmptyState icon="events" title={copy.emptyTitle} text={copy.emptyText}>
						{#snippet action()}
							<Button size="sm" onclick={() => navigate(addPath)}>{#snippet icon()}<Icon name="plus" size={14} />{/snippet}Add</Button>
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
