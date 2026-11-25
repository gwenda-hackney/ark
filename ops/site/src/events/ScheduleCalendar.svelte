<script lang="ts">
	/**
	 * Month grid for the same upcoming nights the schedule list shows.
	 * Monday-first, matching the week groups on the list. Phones get the
	 * month as an agenda instead: seven columns don't fit.
	 */
	import { mediaMatches, SHELL_MOBILE_QUERY } from "../ui/viewport.svelte";
	import { Icon } from "../app/shell";
	import { Button, Segmented } from "../ui";
	import { tick, untrack } from "svelte";
	import type { EventScheduleWeek } from "./event-schedule";
	import {
		buildScheduleCalendar,
		buildScheduleWeek,
		eventWeekStart,
		scheduleMonthLabel,
		shiftScheduleMonth,
		shiftScheduleWeek,
	} from "./event-schedule";
	import { eventItemPath } from "../app/nav";
	import { eventPath } from "./event-lists";
	import type { OpsEvent } from "../app/api";

	let {
		weeks,
		month = $bindable(""),
		today,
		filtersActive = false,
	}: {
		weeks: EventScheduleWeek[];
		month?: string;
		today: string;
		filtersActive?: boolean;
	} = $props();

	/*
	 * One week (Monday to Sunday, taller days), the default, or a month:
	 * remembered in this browser like List or Calendar. A week opens on this week.
	 */
	const SPAN_KEY = "ops.events.calendarSpan";
	const SPANS = [
		{ id: "month", label: "Month" },
		{ id: "week", label: "Week" },
	];
	function readSpan(): "month" | "week" {
		try {
			return localStorage.getItem(SPAN_KEY) === "month" ? "month" : "week";
		} catch {
			return "week";
		}
	}
	let span = $state<"month" | "week">(readSpan());
	let weekOf = $state(untrack(() => today));
	function setSpan(next: string) {
		const value = next === "week" ? "week" : "month";
		if (value === span) return;
		if (value === "week") weekOf = month === today.slice(0, 7) || !month ? today : `${month}-01`;
		else month = eventWeekStart(weekOf).slice(0, 7);
		span = value;
		try {
			localStorage.setItem(SPAN_KEY, value);
		} catch {
			// Private windows: it just isn't remembered.
		}
	}

	const calendar = $derived(span === "week" ? buildScheduleWeek(weeks, weekOf) : buildScheduleCalendar(weeks, month));
	const totalRows = $derived(weeks.reduce((total, week) => total + week.rows.length, 0));
	const nightsInMonth = $derived(
		calendar.days.reduce(
			(total, day) => total + (day.inMonth ? day.rows.length : 0),
			0,
		),
	);
	const monthsWithNights = $derived(
		[...new Set(weeks.flatMap((week) => week.rows.map((row) => row.date.slice(0, 7))))].sort(),
	);
	const previousMonth = $derived(
		[...monthsWithNights].reverse().find((key) => key < calendar.month) || "",
	);
	const nextMonth = $derived(monthsWithNights.find((key) => key > calendar.month) || "");

	function clock(value: string | undefined): string {
		const raw = String(value || "").trim();
		if (!raw) return "";
		const match = /^(\d{1,2}):(\d{2})/.exec(raw);
		if (!match) return raw;
		const hour = Number(match[1]);
		if (!Number.isFinite(hour)) return raw;
		const suffix = hour >= 12 ? "pm" : "am";
		const twelve = hour % 12 || 12;
		return match[2] === "00" ? `${twelve}${suffix}` : `${twelve}:${match[2]}${suffix}`;
	}

	function rowTime(row: EventScheduleWeek["rows"][number]): string {
		const overrides = row.occurrence?.overrides;
		const start = clock(overrides?.startTime) || clock(row.event.startTime);
		const end = clock(overrides?.endTime) || clock(row.event.endTime);
		if (start && end) return `${start}–${end}`;
		if (start) return start;
		return String(overrides?.time || row.event.time || "").trim();
	}

	function rowName(row: EventScheduleWeek["rows"][number]): string {
		return String(row.occurrence?.overrides.name || row.event.name || "Untitled").trim();
	}

	function rowArtist(row: EventScheduleWeek["rows"][number]): string {
		const artist = String(row.occurrence?.overrides.artist || row.event.artist || "").trim();
		if (!artist || artist.toLowerCase() === rowName(row).toLowerCase()) return "";
		return artist;
	}

	function tone(event: OpsEvent): string {
		if (event.publish.preview !== "current") return "unpublished";
		if (event.publish.live === "current") return "live";
		return "preview";
	}

	function dayNumber(iso: string): string {
		return String(Number(iso.slice(8, 10)) || "");
	}

	const phone = mediaMatches(SHELL_MOBILE_QUERY);
	const agendaDays = $derived(calendar.days.filter((day) => day.inMonth && day.rows.length));
	const thisMonth = $derived(
		span === "week" ? eventWeekStart(weekOf) === eventWeekStart(today) : calendar.month === today.slice(0, 7),
	);
	const unit = $derived(span === "week" ? "week" : "month");

	function weekdayShort(iso: string): string {
		return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
	}

	function rowHref(row: EventScheduleWeek["rows"][number]): string {
		return row.event.repeatUnit === "once"
			? eventPath(row.event)
			: eventItemPath(`${row.event.id}@${row.date}`);
	}

	function go(delta: number): void {
		if (span === "week") {
			weekOf = shiftScheduleWeek(weekOf, delta);
			month = weekOf.slice(0, 7);
		} else month = shiftScheduleMonth(calendar.month, delta);
	}

	function goToday(): void {
		weekOf = today;
		month = today.slice(0, 7);
	}

	/*
	 * Opening on this month, or coming back to it: today's week scrolls into
	 * view, however far down the month it is. Other months start at the top.
	 */
	let scrollEl = $state<HTMLDivElement | undefined>();
	$effect(() => {
		const box = scrollEl;
		const showingToday = thisMonth && span === "month";
		void calendar.month;
		if (!box) return;
		void tick().then(() => {
			if (!showingToday) {
				box.scrollTop = 0;
				return;
			}
			const cell = box.querySelector<HTMLElement>(".day.today");
			if (!cell) return;
			const cellTop = cell.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
			const header = box.querySelector<HTMLElement>(".head")?.offsetHeight ?? 0;
			const fits = cellTop + cell.offsetHeight <= box.clientHeight;
			box.scrollTop = fits ? 0 : Math.max(0, cellTop - header - 8);
		});
	});
</script>

<div class="calendar">
	<div class="calendar-bar">
		<h2 aria-live="polite">{calendar.label}</h2>
		<div class="calendar-actions">
			<p class="count">
				{nightsInMonth === 1 ? "1 night" : `${nightsInMonth} nights`}
			</p>
			<Segmented size="sm" tone="soft" items={SPANS} value={span} ariaLabel="Show a month or a week" onChange={(id: string) => setSpan(id)} />
			<div class="stepper" role="group" aria-label={unit === "week" ? "Week" : "Month"}>
				<Button type="button" variant="outline" size="sm" aria-label="Previous {unit}" title="Previous {unit}" onclick={() => go(-1)}>
					{#snippet icon()}<Icon name="chevron-left" size={16} />{/snippet}
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={thisMonth}
					title={thisMonth ? `Already showing this ${unit}` : `Back to this ${unit}`}
					onclick={goToday}
				>
					{#snippet icon()}<Icon name="calendar" size={14} />{/snippet}
					Today
				</Button>
				<Button type="button" variant="outline" size="sm" aria-label="Next {unit}" title="Next {unit}" onclick={() => go(1)}>
					{#snippet icon()}<Icon name="chevron-right" size={16} />{/snippet}
				</Button>
			</div>
		</div>
	</div>

	{#if totalRows === 0}
		<p class="empty">
			{filtersActive ? "No nights match these filters." : "No upcoming nights."}
		</p>
	{:else if nightsInMonth === 0 && span === "week"}
		<p class="note">No nights this week.</p>
	{:else if nightsInMonth === 0}
		<p class="note">
			No nights in {calendar.label}.
			{#if previousMonth}
				<button type="button" class="jump" onclick={() => (month = previousMonth)}>
					Show {scheduleMonthLabel(previousMonth)}
				</button>
			{/if}
			{#if nextMonth}
				<button type="button" class="jump" onclick={() => (month = nextMonth)}>
					Show {scheduleMonthLabel(nextMonth)}
				</button>
			{/if}
		</p>
	{/if}

	{#if phone.matches}
		<ol class="agenda" aria-label={calendar.label}>
			{#each agendaDays as day (day.date)}
				<li class="agenda-day" class:today={day.date === today} class:past={day.date < today}>
					<div class="date" aria-label={day.date}>
						<span class="weekday">{weekdayShort(day.date)}</span>
						<span class="daynum tnum">{dayNumber(day.date)}</span>
					</div>
					<div class="events">
						{#each day.rows as row (`${row.event.id}:${row.occurrence?.id || row.date}`)}
							{@const name = rowName(row)}
							{@const artist = rowArtist(row)}
							{@const time = rowTime(row)}
							<a class="chip {tone(row.event)}" href={rowHref(row)}>
								{#if time}<span class="when">{time}</span>{/if}
								<span class="name">{name}</span>
								{#if artist}<span class="artist">{artist}</span>{/if}
							</a>
						{/each}
					</div>
				</li>
			{/each}
		</ol>
	{:else}
	<div class="scroll" bind:this={scrollEl}>
		<div class="grid" class:week={span === "week"} role="grid" aria-label={calendar.label}>
			{#each calendar.weekdays as weekday (weekday)}
				<div class="head" role="columnheader">{weekday}</div>
			{/each}
			{#each calendar.days as day (day.date)}
				<div
					class="day"
					class:outside={!day.inMonth}
					class:today={day.date === today}
					class:past={day.date < today}
					role="gridcell"
					aria-label={day.date}
				>
					<span class="num">{dayNumber(day.date)}</span>
					<div class="events">
						{#each day.rows as row (`${row.event.id}:${row.occurrence?.id || row.date}`)}
							{@const name = rowName(row)}
							{@const artist = rowArtist(row)}
							{@const time = rowTime(row)}
							<a
								class="chip {tone(row.event)}"
								href={rowHref(row)}
								title={[time, name, artist].filter(Boolean).join(" · ")}
							>
								{#if time}<span class="when">{time}</span>{/if}
								<span class="name">{name}</span>
								{#if artist}<span class="artist">{artist}</span>{/if}
							</a>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</div>
	{/if}
</div>

<style>
	/* A little room so focus rings on the edge buttons aren't clipped by the list's scroll box. */
	.calendar {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: var(--space-4);
		margin: -3px;
		padding: 3px;
		min-width: 0;
		min-height: 0;
		height: 100%;
	}

	.calendar-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
	}

	.calendar-actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.stepper {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	h2 {
		margin: 0;
		font-family: var(--font);
		font-size: var(--text-lg);
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	.count,
	.empty,
	.note {
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.note {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
	}

	.jump {
		border: 0;
		padding: 0;
		background: none;
		color: var(--primary);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}

	.jump:hover {
		text-decoration: underline;
	}

	.scroll {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		overflow: auto;
	}

	.grid {
		display: grid;
		flex: 1;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		grid-template-rows: auto;
		grid-auto-rows: minmax(6.75rem, 1fr);
		min-width: 0;
		height: 100%;
		min-height: min-content;
		border-top: 1px solid var(--border);
		border-left: 1px solid var(--border);
		border-radius: var(--radius-md);
	}

	/* A week: one row of tall days filling the space. */
	.grid.week {
		grid-auto-rows: minmax(16rem, 1fr);
	}

	/*
	 * See-through, so the page's glow shows behind them. They used to paint
	 * the glow themselves (fixed to the window), which the browser drew green
	 * inside this scroll box until the first scroll. The lines are borders.
	 */
	.head,
	.day {
		background: transparent;
		border-right: 1px solid var(--border);
		border-bottom: 1px solid var(--border);
		min-width: 0;
	}

	/* The weekday names stay in view as the month scrolls, solid so days go under them. */
	.head {
		position: sticky;
		top: 0;
		z-index: 1;
		background: color-mix(in srgb, var(--surface-1) 86%, var(--background));
		padding: var(--space-2) var(--space-2);
		color: var(--muted-foreground);
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		line-height: 1.2;
		text-align: center;
		text-transform: uppercase;
	}

	.day {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-height: 0;
		padding: var(--space-2);
		overflow: auto;
	}

	.day.outside {
		background: var(--sunken);
	}

	.outside .chip {
		opacity: 0.8;
	}

	.day.today {
		background: var(--accent);
	}

	.num {
		position: relative;
		z-index: 0;
		align-self: flex-start;
		width: max-content;
		font-size: var(--text-xs);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		font-feature-settings: var(--font-features-num);
		color: var(--muted-foreground);
		line-height: 1;
	}

	/* The mark sits behind the digits and does not change the line box. */
	.today .num {
		color: var(--primary-foreground);
		opacity: 1;
	}

	.today .num::before {
		content: "";
		position: absolute;
		z-index: -1;
		inset: -0.28rem -0.42rem;
		border-radius: var(--radius-pill);
		background: var(--primary);
	}

	.past .num,
	.outside .num {
		opacity: 0.45;
	}

	.events {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}

	.chip {
		display: grid;
		gap: 0.05rem;
		min-width: 0;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		background: var(--primary-wash);
		color: inherit;
		text-decoration: none;
	}

	.chip:hover {
		background: var(--primary-wash-strong);
	}

	.chip:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 1px;
	}

	.chip.live {
		background: var(--primary-wash-strong);
	}

	.chip.unpublished {
		background: transparent;
		box-shadow: inset 0 0 0 1px var(--border-strong);
	}

	.chip.unpublished:hover {
		background: var(--accent);
	}

	.when {
		color: var(--primary);
		font-size: var(--text-2xs);
		font-weight: 600;
		line-height: 1.2;
	}

	.name,
	.artist {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		line-height: 1.25;
	}

	.name {
		font-size: var(--text-xs);
		font-weight: 500;
	}

	.artist {
		color: var(--muted-foreground);
		font-size: var(--text-2xs);
	}

	/* Phones: the month as an agenda, a date block beside each day's nights. */
	.agenda {
		display: grid;
		margin: 0;
		padding: 0 0 var(--space-4);
		overflow-y: auto;
		list-style: none;
	}

	.agenda-day {
		display: grid;
		grid-template-columns: 3rem minmax(0, 1fr);
		gap: var(--space-3);
		padding-block: var(--space-3);
		border-top: 1px solid var(--border);
	}

	.agenda-day:first-child {
		border-top: 0;
	}

	.date {
		display: grid;
		justify-items: center;
		align-content: start;
		padding-block: var(--space-2);
		border-radius: var(--radius-md);
		background: var(--surface-2);
		line-height: 1.1;
	}

	.weekday {
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--primary);
	}

	.daynum {
		font-size: var(--text-lg);
		font-weight: 600;
	}

	.agenda-day.today .date {
		background: var(--primary-wash);
	}

	.agenda-day.past {
		opacity: 0.6;
	}

	.agenda .chip {
		padding: var(--space-2) var(--space-3);
	}

	.agenda .name {
		font-size: var(--text-base);
	}

	.agenda .when,
	.agenda .artist {
		font-size: var(--text-xs);
	}
</style>
