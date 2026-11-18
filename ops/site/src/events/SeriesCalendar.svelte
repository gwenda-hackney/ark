<script lang="ts">
	/**
	 * A series' nights on its Schedule tab: two months at a time as Monday-first
	 * weeks, or on phones the same months as an agenda by week. A night that
	 * follows the series shows its time only; one that differs carries a mark.
	 *
	 * The Schedule page has its own calendar (ScheduleCalendar) for every
	 * event at once; both build their months with `scheduleMonthDays`.
	 */
	import { mediaMatches, SHELL_MOBILE_QUERY } from "../ui/viewport.svelte";
	import { Icon } from "../app/shell";
	import { Button } from "../ui";
	import { eventItemPath } from "../app/nav";
	import { formatDate } from "./event-labels";
	import { SCHEDULE_WEEKDAYS, scheduleMonthLabel, shiftScheduleMonth } from "./event-schedule";
	import {
		seriesAgendaWeeks,
		seriesCalendarMonths,
		seriesMonthRange,
		type SeriesNight,
		type SeriesNightMarkKind,
	} from "./series-calendar";

	const MONTHS_SHOWN = 2;

	let {
		nights,
		eventId,
		today,
	}: {
		nights: SeriesNight[];
		/** Empty while the series isn't saved: nights can't be opened yet. */
		eventId: string;
		today: string;
	} = $props();

	const thisMonth = $derived(today.slice(0, 7));
	let chosen = $state("");
	const range = $derived(seriesMonthRange(nights, thisMonth, MONTHS_SHOWN));
	const first = $derived.by(() => {
		const wanted = chosen || thisMonth;
		if (wanted < range.earliest) return range.earliest;
		if (wanted > range.latest) return range.latest;
		return wanted;
	});
	const months = $derived(seriesCalendarMonths(nights, first, MONTHS_SHOWN));
	const after = $derived(shiftScheduleMonth(first, MONTHS_SHOWN));
	const last = $derived(shiftScheduleMonth(first, MONTHS_SHOWN - 1));
	/** "November – December 2026", or with both years across a new year. */
	const rangeLabel = $derived(
		`${first.slice(0, 4) === last.slice(0, 4) ? scheduleMonthLabel(first).replace(/ \d{4}$/, "") : scheduleMonthLabel(first)} – ${scheduleMonthLabel(last)}`,
	);
	const shownNights = $derived(nights.filter((night) => night.date >= `${first}-01` && night.date < `${after}-01`));
	const weeks = $derived(seriesAgendaWeeks(nights, `${first}-01`, `${after}-01`));
	const phone = mediaMatches(SHELL_MOBILE_QUERY);

	const LEGEND: { kind: SeriesNightMarkKind; label: string }[] = [
		{ kind: "added", label: "Added" },
		{ kind: "time", label: "Own time" },
		{ kind: "edited", label: "Own details" },
		{ kind: "skipped", label: "Skipped" },
	];

	function go(delta: number): void {
		chosen = shiftScheduleMonth(first, delta);
	}

	function dayNumber(iso: string): string {
		return String(Number(iso.slice(8, 10)));
	}

	function nightHref(night: SeriesNight): string {
		return eventItemPath(`${eventId}@${night.date}`);
	}

	function nightLabel(night: SeriesNight): string {
		return [formatDate(night.date), night.time, night.title, night.guest, ...night.marks.map((mark) => mark.title)]
			.filter(Boolean)
			.join(", ");
	}

	function headline(night: SeriesNight): string {
		return [night.title, night.guest].filter(Boolean).join(" · ");
	}
</script>

{#snippet marks(night: SeriesNight)}
	{#if night.marks.length}
		<span class="marks">
			{#each night.marks as mark (mark.kind)}
				<span class="mark {mark.kind}" title={mark.title}>
					{#if mark.kind === "special"}<Icon name="star" size={11} />{:else}<span class="dot" aria-hidden="true"></span>{/if}
					{mark.label}
				</span>
			{/each}
		</span>
	{/if}
{/snippet}

<div class="series-calendar">
	<div class="bar">
		<div class="stepper" role="group" aria-label="Months">
			<Button
				type="button"
				variant="outline"
				size="sm"
				aria-label="Previous month"
				title="Previous month"
				disabled={first <= range.earliest}
				reason={first <= range.earliest ? "No earlier nights" : undefined}
				onclick={() => go(-1)}
			>
				{#snippet icon()}<Icon name="chevron-left" size={16} />{/snippet}
			</Button>
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={first === thisMonth}
				reason={first === thisMonth ? "Already showing this month" : undefined}
				onclick={() => (chosen = thisMonth)}
			>
				{#snippet icon()}<Icon name="calendar" size={14} />{/snippet}
				Today
			</Button>
			<Button
				type="button"
				variant="outline"
				size="sm"
				aria-label="Next month"
				title="Next month"
				disabled={first >= range.latest}
				reason={first >= range.latest ? "No later nights yet" : undefined}
				onclick={() => go(1)}
			>
				{#snippet icon()}<Icon name="chevron-right" size={16} />{/snippet}
			</Button>
			<p class="range" aria-live="polite">{rangeLabel}</p>
		</div>
		<ul class="legend" aria-label="Marks">
			{#each LEGEND as item (item.kind)}
				<li class="mark {item.kind}"><span class="dot" aria-hidden="true"></span>{item.label}</li>
			{/each}
		</ul>
	</div>

	{#if phone.matches}
		{#if weeks.length}
			<div class="agenda">
				{#each weeks as week (week.start)}
					<section class="agenda-week" aria-label={week.label}>
						<h3>{week.label}</h3>
						<ul>
							{#each week.nights as night (night.date)}
								<li class:past={night.date < today} class:today={night.date === today}>
									{#if night.skipped || !eventId}
										<div class="agenda-row" class:skipped={night.skipped}>
											<span class="agenda-date">{formatDate(night.date)}</span>
											<span class="agenda-main">
												<span class="when">{night.time}</span>
												{#if headline(night)}<span class="own">{headline(night)}</span>{/if}
												{@render marks(night)}
											</span>
										</div>
									{:else}
										<a class="agenda-row" href={nightHref(night)} aria-label={nightLabel(night)}>
											<span class="agenda-date">{formatDate(night.date)}</span>
											<span class="agenda-main">
												<span class="when">{night.time}</span>
												{#if headline(night)}<span class="own">{headline(night)}</span>{/if}
												{@render marks(night)}
											</span>
											<span class="chevron" aria-hidden="true"><Icon name="chevron-right" size={16} /></span>
										</a>
									{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			</div>
		{:else}
			<p class="note">No nights in {rangeLabel}.</p>
		{/if}
	{:else}
		<div class="months">
			{#each months as month (month.month)}
				<section class="month" aria-label={month.label}>
					<h3>{month.label}</h3>
					<div class="grid" role="grid" aria-label={month.label}>
						<div class="row" role="row">
							{#each SCHEDULE_WEEKDAYS as weekday (weekday)}
								<div class="head" role="columnheader">{weekday}</div>
							{/each}
						</div>
						{#each month.weeks as week (week[0].date)}
							<div class="row" role="row">
								{#each week as day (day.date)}
									{@const night = day.night}
									<div
										class="day"
										class:outside={!day.inMonth}
										class:has-night={night && !night.skipped}
										class:today={day.date === today}
										class:past={day.date < today}
										role="gridcell"
										aria-label={day.inMonth && !night ? `${formatDate(day.date)}, no night` : undefined}
									>
										{#if day.inMonth}
											<span class="num">{dayNumber(day.date)}</span>
											{#if night}
												{#if night.skipped || !eventId}
													<div class="night" class:skipped={night.skipped} title={nightLabel(night)}>
														<span class="when">{night.time}</span>
														{#if headline(night)}<span class="own">{headline(night)}</span>{/if}
														{@render marks(night)}
													</div>
												{:else}
													<a class="night" href={nightHref(night)} aria-label={nightLabel(night)} title={nightLabel(night)}>
														<span class="when">{night.time}</span>
														{#if headline(night)}<span class="own">{headline(night)}</span>{/if}
														{@render marks(night)}
													</a>
												{/if}
											{/if}
										{/if}
									</div>
								{/each}
							</div>
						{/each}
					</div>
				</section>
			{/each}
		</div>
		{#if !shownNights.length}
			<p class="note">No nights in {rangeLabel}.</p>
		{/if}
	{/if}
</div>

<style>
	.series-calendar {
		display: grid;
		gap: var(--space-4);
		grid-column: 1 / -1;
		min-width: 0;
	}

	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-6);
	}

	/* The buttons come first so a longer month name never pushes them. */
	.stepper {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.range {
		margin: 0 0 0 var(--space-3);
		font-size: var(--text-sm);
		font-weight: 600;
		white-space: nowrap;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
		color: var(--muted-foreground);
		font-size: var(--text-xs);
	}

	.note {
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	h3 {
		margin: 0 0 var(--space-2);
		font-size: var(--text-base);
		font-weight: 600;
	}

	/* Side by side when there's room for two readable months, else stacked. */
	.months {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 34rem), 1fr));
		gap: var(--space-6) var(--space-8);
		align-items: start;
	}

	.month {
		min-width: 0;
	}

	.grid {
		display: grid;
		gap: 1px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--border);
		overflow: hidden;
	}

	.row {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 1px;
	}

	.head,
	.day {
		min-width: 0;
		background: var(--background);
	}

	.head {
		padding: var(--space-1) var(--space-2);
		color: var(--muted-foreground);
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-align: center;
		text-transform: uppercase;
	}

	.day {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-height: 4.75rem;
		padding: var(--space-1-5, 0.375rem);
	}

	/* No night: a quiet, empty-looking day. */
	.day:not(.has-night) {
		background: var(--sunken);
	}

	.day.outside {
		background: transparent;
	}

	.day.past {
		opacity: 0.5;
	}

	.num {
		position: relative;
		z-index: 0;
		align-self: flex-start;
		padding-left: 0.15rem;
		color: var(--muted-foreground);
		font-size: var(--text-xs);
		font-weight: 600;
		font-feature-settings: var(--font-features-num);
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}

	.today .num {
		color: var(--primary-foreground);
	}

	.today .num::before {
		content: "";
		position: absolute;
		z-index: -1;
		inset: -0.28rem -0.3rem -0.28rem -0.15rem;
		border-radius: var(--radius-pill);
		background: var(--primary);
	}

	.night {
		display: grid;
		flex: 1;
		align-content: start;
		gap: 0.15rem;
		min-width: 0;
		padding: var(--space-1) var(--space-1-5, 0.375rem);
		border-radius: var(--radius-sm);
		background: var(--primary-wash);
		color: inherit;
		text-decoration: none;
	}

	a.night:hover {
		background: var(--primary-wash-strong);
	}

	a.night:focus-visible,
	a.agenda-row:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 1px;
	}

	.night.skipped {
		background: transparent;
		outline: 1px dashed var(--border-strong);
		outline-offset: -1px;
	}

	.skipped .when {
		color: var(--muted-foreground);
		text-decoration: line-through;
	}

	.when {
		color: var(--foreground);
		font-size: var(--text-xs);
		font-weight: 600;
		font-feature-settings: var(--font-features-num);
		line-height: 1.2;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.own {
		overflow: hidden;
		font-size: var(--text-2xs);
		line-height: 1.25;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.marks {
		display: flex;
		flex-wrap: wrap;
		gap: 0.1rem var(--space-2);
	}

	.mark {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		color: var(--muted-foreground);
		font-size: var(--text-2xs);
		line-height: 1.2;
		white-space: nowrap;
	}

	.marks .mark {
		font-weight: 600;
	}

	.dot {
		flex-shrink: 0;
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: currentColor;
	}

	.mark.added .dot {
		background: var(--success);
	}

	.mark.time .dot {
		background: var(--warning);
	}

	.mark.edited .dot {
		background: var(--info);
	}

	.mark.skipped .dot {
		background: transparent;
		box-shadow: inset 0 0 0 1.5px var(--muted-foreground);
	}

	.mark.special {
		color: var(--primary);
	}

	/* Phones: the same months as weeks of rows. */
	.agenda {
		display: grid;
		gap: var(--space-4);
	}

	.agenda-week h3 {
		color: var(--muted-foreground);
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
	}

	.agenda-week ul {
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--border);
		list-style: none;
	}

	.agenda-week li {
		border-bottom: 1px solid var(--border);
	}

	.agenda-week li.past {
		opacity: 0.5;
	}

	.agenda-row {
		display: grid;
		grid-template-columns: 6.5rem minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-3);
		min-height: 2.75rem;
		padding: var(--space-2) 0;
		color: inherit;
		text-decoration: none;
	}

	.agenda-date {
		font-size: var(--text-sm);
		font-weight: 600;
		font-feature-settings: var(--font-features-num);
	}

	.today .agenda-date {
		color: var(--primary);
	}

	.agenda-main {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.15rem var(--space-3);
		min-width: 0;
	}

	.agenda-main .when {
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.agenda-main .own {
		flex-basis: 100%;
		font-size: var(--text-xs);
	}

	.chevron {
		display: inline-flex;
		color: var(--muted-foreground);
	}
</style>
