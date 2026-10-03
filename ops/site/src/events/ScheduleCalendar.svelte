<script lang="ts">
	/**
	 * Month grid for the same upcoming nights the schedule list shows.
	 * Monday-first, matching the week groups on the list. Phones get the
	 * month as an agenda instead: seven columns don't fit.
	 */
	import { mediaMatches, SHELL_MOBILE_QUERY } from "../ui/viewport.svelte";
	import { Icon } from "../app/shell";
	import { Button } from "../ui";
	import type { EventScheduleWeek } from "./event-schedule";
	import {
		buildScheduleCalendar,
		scheduleMonthLabel,
		shiftScheduleMonth,
	} from "./event-schedule";
	import { eventItemPath } from "../app/nav";
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

	const calendar = $derived(buildScheduleCalendar(weeks, month));
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
	const thisMonth = $derived(calendar.month === today.slice(0, 7));

	function weekdayShort(iso: string): string {
		return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
	}

	function rowHref(row: EventScheduleWeek["rows"][number]): string {
		return row.event.repeatUnit === "once"
			? eventItemPath(row.event.id)
			: eventItemPath(`${row.event.id}@${row.date}`);
	}

	function go(delta: number): void {
		month = shiftScheduleMonth(calendar.month, delta);
	}
</script>

<div class="calendar">
	<div class="calendar-bar">
		<h2 aria-live="polite">{calendar.label}</h2>
		<div class="calendar-actions">
			<p class="count">
				{nightsInMonth === 1 ? "1 night" : `${nightsInMonth} nights`}
			</p>
			<div class="stepper" role="group" aria-label="Month">
				<Button type="button" variant="outline" size="sm" aria-label="Previous month" title="Previous month" onclick={() => go(-1)}>
					{#snippet icon()}<Icon name="chevron-left" size={16} />{/snippet}
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={thisMonth}
					title={thisMonth ? "Already showing this month" : "Back to this month"}
					onclick={() => (month = today.slice(0, 7))}
				>
					Today
				</Button>
				<Button type="button" variant="outline" size="sm" aria-label="Next month" title="Next month" onclick={() => go(1)}>
					{#snippet icon()}<Icon name="chevron-right" size={16} />{/snippet}
				</Button>
			</div>
		</div>
	</div>

	{#if totalRows === 0}
		<p class="empty">
			{filtersActive ? "No nights match these filters." : "No upcoming nights."}
		</p>
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
	<div class="scroll">
		<div class="grid" role="grid" aria-label={calendar.label}>
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
								href={row.event.repeatUnit === "once"
									? eventItemPath(row.event.id)
									: eventItemPath(`${row.event.id}@${row.date}`)}
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
		gap: 1px;
		min-width: 0;
		height: 100%;
		min-height: min-content;
		background: var(--border);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.head,
	.day {
		background: var(--background);
		min-width: 0;
	}

	.head {
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
