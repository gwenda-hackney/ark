<script lang="ts">
	import { Icon } from "../../app/shell";
	import { DateField, Field, NativeSelect, NumberField, Tip } from "../../ui";
	import type { FormErrors } from "../../ui/form-errors.svelte";
	import type { OpsEvent } from "../../app/api";
	import { eventItemPath } from "../../app/nav";
	import { WEEKDAY_LABELS } from "../event-labels";
	import { WEEKDAYS } from "../event-recurrence.js";
	import type { EventForm } from "../event-form.svelte";

	let {
		form,
		errors,
		current,
		eventId,
		editingOccurrence,
		previewDates,
	}: {
		form: EventForm;
		/** Problems from the last Save, by field id. */
		errors: FormErrors;
		/** The saved event (null while new). */
		current: OpsEvent | null;
		eventId: string;
		/** One night of a series: the rule belongs to the series and is read-only here. */
		editingOccurrence: boolean;
		/** Upcoming nights from the rule as typed. */
		previewDates: string[];
	} = $props();
</script>

<section class="block">
	{#if form.repeatUnit === "none"}
		<p class="hint">
			This series does not repeat. Add each night when it is
			scheduled (Details → Series, or New with this series
			selected).
		</p>
	{/if}
	<div class="rule-fields">
		<div class="rule-row">
			<Field
				label="Repeats"
				for="event-unit"
				width="md"
				tooltip="Weekly or monthly builds the calendar. Does not repeat is for series like Gwenda Nights, where each night is added on its own date."
			>
				<NativeSelect
					id="event-unit"
					size="sm"
					bind:value={form.repeatUnit}
					disabled={editingOccurrence}
					options={[
						{ value: "none", label: "Does not repeat" },
						{ value: "day", label: "Day" },
						{ value: "week", label: "Week" },
						{ value: "month", label: "Month" },
					]}
				/>
			</Field>
			{#if form.repeatUnit !== "none"}
				<Field
					label="Every"
					for="event-every"
					width="xs"
					error={errors.get("event-every")}
					hint="1 is every {form.repeatUnit}."
				>
					<NumberField
						id="event-every"
						size="sm"
						integer
						min={1}
						max={52}
						bind:value={form.repeatEvery}
						disabled={editingOccurrence}
					/>
				</Field>
			{/if}
			{#if form.repeatUnit === "week"}
				<Field
					label="On"
					class="days"
					tooltip="Which weekdays the night falls on. Pick more than one for a series that runs several nights a week."
				>
					<div class="chips" role="group" aria-label="Weekdays">
						{#each WEEKDAYS as day (day)}
							<button
								type="button"
								class="chip"
								class:on={form.weekdays.includes(day)}
								aria-pressed={form.weekdays.includes(day)}
								disabled={editingOccurrence}
								onclick={() => form.toggleWeekday(day)}
							>
								{WEEKDAY_LABELS[day]}
							</button>
						{/each}
					</div>
				</Field>
			{/if}
			{#if form.repeatUnit === "month"}
				<Field
					label="Day of month"
					for="event-month-day"
					width="sm"
					optional
					error={errors.get("event-month-day")}
					hint="Blank follows Starts on."
				>
					<NumberField
						id="event-month-day"
						size="sm"
						integer
						min={1}
						max={31}
						bind:value={form.monthDay}
						disabled={editingOccurrence}
					/>
				</Field>
			{/if}
		</div>
		<div class="rule-row">
			<Field
				label="Starts on"
				for="event-starts"
				width="sm"
				optional
				error={errors.get("event-starts")}
				tooltip={form.repeatUnit === "none"
					? "First scheduled night. Leave empty until you add a night."
					: "First night of the series. Recurrence builds forward from here. Leave empty if it is not fixed yet: the website says “Check back soon for the next date”."}
			>
				<DateField id="event-starts" size="sm" bind:value={form.startsOn} disabled={editingOccurrence} />
			</Field>
			<Field
				label="Ends on"
				for="event-ends"
				width="sm"
				optional={form.repeatUnit === "none" || !form.startsOn}
				error={errors.get("event-ends")}
				hint={form.repeatUnit === "none"
					? "Not used when nights are added one by one."
					: "The last night. Needed once it has a start."}
			>
				<DateField
					id="event-ends"
					size="sm"
					bind:value={form.endsOn}
					min={form.startsOn}
					disabled={editingOccurrence}
				/>
			</Field>
		</div>
	</div>
	{#if previewDates.length}
		<h2 class="section-title">
			<span class="section-label">
				Upcoming
				<Tip
					label="Upcoming"
					tooltip={form.repeatUnit === "none"
						? "Each night is its own date. A star marks a night with its own guest or collaboration."
						: "Nights from this series rule. Guest and times show when a night overrides the series defaults."}
				/>
			</span>
		</h2>
		<ul class="occurrences">
			{#each previewDates as date (date)}
				{@const occurrence = current?.dates.find((row) => row.date === date)}
				{@const special = form.nightIsSpecialEvent(occurrence)}
				{@const details = form.nightDetailLines(current, occurrence, date)}
				<li>
					<div class="occurrence-main">
						<strong class="occurrence-title">
							{#if special}
								<span
									class="occurrence-special"
									title="Special event"
									aria-label="Special event"
								>
									<Icon name="star" size={13} />
								</span>
							{/if}
							{form.nightHeadline(current, occurrence, date)}
						</strong>
						{#each details as line (line)}
							<span class="occurrence-detail">{line}</span>
						{/each}
					</div>
					{#if eventId}
						<a
							class="occurrence-link"
							href={eventItemPath(`${eventId}@${date}`)}
						>
							Edit night
						</a>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="hint">
			{form.startsOn
				? form.repeatUnit === "none"
					? "No nights scheduled yet."
					: "No upcoming date for this rule."
				: "No start date yet. The website shows this series with “Check back soon for the next date” and a link to our Instagram."}
		</p>
	{/if}
</section>

<style>
	.occurrence-link {
		color: var(--primary);
		font-size: var(--text-xs);
		font-weight: 600;
		text-decoration: none;
	}

	.hint {
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.block {
		display: grid;
		gap: var(--space-3);
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin: var(--space-2) 0 0;
		font-size: var(--text-md);
		font-weight: 600;
		line-height: 1.3;
		color: var(--foreground);
	}

	.section-title::after {
		content: "";
		flex: 1 1 auto;
		height: 1px;
		min-width: 1.5rem;
		background: var(--border-strong);
	}

	.section-label {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}

	.rule-fields {
		display: grid;
		gap: var(--space-4);
		padding-bottom: var(--space-2);
	}

	/* Repeat pattern on the first row, dates on the second; fields share one width so the rows line up. */
	.rule-row {
		display: flex;
		flex-wrap: wrap;
		align-items: start;
		gap: var(--space-3) var(--space-4);
	}

	/* Each field takes its own width token. */
	.rule-row > :global(.field) {
		flex: 0 1 auto;
	}

	.rule-row > :global(.field.days) {
		flex: 0 1 auto;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.chip {
		min-width: 3.25rem;
		height: var(--control-h-sm);
		border: 1px solid var(--border);
		background: transparent;
		color: var(--foreground);
		border-radius: var(--radius-pill);
		padding: 0 var(--space-3);
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.chip:disabled {
		cursor: default;
		opacity: 0.6;
	}

	.chip.on {
		border-color: var(--primary);
		color: var(--primary);
		background: var(--primary-wash);
	}

	.occurrences {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr));
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.occurrences li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-3) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface-2);
	}

	.occurrence-main {
		display: grid;
		gap: 0.2rem;
		min-width: 0;
	}

	.occurrence-title {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.occurrence-special {
		display: inline-flex;
		color: var(--muted-foreground);
	}

	.occurrence-detail {
		color: var(--muted-foreground);
		font-size: var(--text-xs);
		line-height: 1.35;
	}

	.hint {
		margin: 0;
	}
</style>
