<script lang="ts">
	/**
	 * Month grid for the same upcoming nights the schedule list shows.
	 * Monday-first, matching the week groups on the list.
	 */
	import { Icon } from "../../shell";
	import { Button } from "../../ui";
	import type { EventScheduleWeek } from "../../lib/event-schedule";
	import {
		buildScheduleCalendar,
		scheduleMonthLabel,
		shiftScheduleMonth,
	} from "../../lib/event-schedule";
	import { eventItemPath } from "../../lib/nav";
	import type { OpsEvent } from "../../lib/api";

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

	function go(delta: number): void {
		month = shiftScheduleMonth(calendar.month, delta);
	}
</script>

<div class="calendar">
	<div class="calendar-bar">
		<div class="calendar-nav">
			<Button
				type="button"
				variant="ghost"
				size="sm"
				aria-label="Previous month"
				onclick={() => go(-1)}
			>
				{#snippet icon()}
					<Icon name="chevron-left" size={16} />
				{/snippet}
			</Button>
			<h2 aria-live="polite">{calendar.label}</h2>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				aria-label="Next month"
				onclick={() => go(1)}
			>
				{#snippet icon()}
					<Icon name="chevron-right" size={16} />
				{/snippet}
			</Button>
		</div>
		<div class="calendar-actions">
			<p class="count">
				{nightsInMonth === 1 ? "1 night" : `${nightsInMonth} nights`}
			</p>
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={calendar.month === today.slice(0, 7)}
				onclick={() => (month = today.slice(0, 7))}
			>
				Today
			</Button>
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
</div>

<style>
	.calendar {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: var(--gap);
		min-width: 0;
		min-height: 0;
		height: 100%;
	}

	.calendar-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap);
		flex-wrap: wrap;
	}

	.calendar-nav,
	.calendar-actions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	h2 {
		margin: 0;
		min-width: 11rem;
		text-align: center;
		font-size: 1.05rem;
		font-weight: 600;
		letter-spacing: 0.02em;
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
		gap: 0.35rem 0.75rem;
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
		padding: 0.55rem 0.45rem;
		color: var(--muted-foreground);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		line-height: 1.2;
		text-align: center;
		text-transform: uppercase;
	}

	.day {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		min-height: 0;
		padding: 0.4rem;
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
		gap: 0.25rem;
		min-width: 0;
	}

	.chip {
		display: grid;
		gap: 0.05rem;
		min-width: 0;
		padding: 0.28rem 0.4rem;
		border-radius: var(--radius-xs);
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
		font-size: 0.6875rem;
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
		font-size: 0.6875rem;
	}

	@media (max-width: 720px) {
		.grid {
			min-width: 46rem;
		}
	}
</style>
