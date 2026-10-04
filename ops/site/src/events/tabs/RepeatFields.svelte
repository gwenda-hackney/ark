<script lang="ts">
	/**
	 * A series' pattern under When, as cells of the form's grid: how it
	 * repeats on one row, then its first and last night as a pair (the
	 * night's times pair up on the row after).
	 */
	import { DateField, Field, NativeSelect, NumberField } from "../../ui";
	import type { FormErrors } from "../../ui/form-errors.svelte";
	import { WEEKDAY_LABELS } from "../event-labels";
	import { WEEKDAYS } from "../event-recurrence.js";
	import type { EventForm } from "../event-form.svelte";

	let { form, errors }: { form: EventForm; errors: FormErrors } = $props();

	const unitWord = $derived(
		form.repeatUnit === "day" ? "day" : form.repeatUnit === "month" ? "month" : "week",
	);
</script>

<Field
	class={form.repeatUnit === "none" ? "span-6" : "span-3"}
	label="Repeats"
	for="event-unit"
>
	<NativeSelect
		id="event-unit"
		size="sm"
		bind:value={form.repeatUnit}
		options={[
			{ value: "none", label: "Doesn't repeat" },
			{ value: "day", label: "Daily" },
			{ value: "week", label: "Weekly" },
			{ value: "month", label: "Monthly" },
		]}
	/>
</Field>
{#if form.repeatUnit !== "none"}
	<Field class="span-3" label="Every" for="event-every" required error={errors.get("event-every")}>
		<NumberField
			id="event-every"
			size="sm"
			integer
			min={1}
			max={52}
			unit={Number(form.repeatEvery) === 1 ? unitWord : `${unitWord}s`}
			bind:value={form.repeatEvery}
		/>
	</Field>
{/if}
{#if form.repeatUnit === "month"}
	<Field
		class="span-3"
		label="Day of month"
		for="event-month-day"
		optional
		error={errors.get("event-month-day")}
	>
		<NumberField id="event-month-day" size="sm" integer min={1} max={31} bind:value={form.monthDay} />
	</Field>
{/if}
{#if form.repeatUnit === "week"}
	<Field
		class="span-6 days"
		label="On"
		help="Schedule tab"
	>
		<div class="chips" role="group" aria-label="Weekdays">
			{#each WEEKDAYS as day (day)}
				<button
					type="button"
					class="chip"
					class:on={form.weekdays.includes(day)}
					aria-pressed={form.weekdays.includes(day)}
					onclick={() => form.toggleWeekday(day)}
				>
					{WEEKDAY_LABELS[day]}
				</button>
			{/each}
		</div>
	</Field>
{/if}

<Field
	class="span-half row-start"
	label="First night"
	for="event-starts"
	optional
	error={errors.get("event-starts")}
	help="Schedule tab"
>
	<DateField id="event-starts" size="sm" bind:value={form.startsOn} />
</Field>
{#if form.repeatUnit !== "none"}
	<Field
		class="span-half"
		label="Last night"
		for="event-ends"
		required={Boolean(form.startsOn)}
		error={errors.get("event-ends")}
		help="Schedule tab"
	>
		<DateField id="event-ends" size="sm" bind:value={form.endsOn} min={form.startsOn} />
	</Field>
{/if}

<style>
	/* Seven days share the row evenly, so they line up with the fields. */
	.chips {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: var(--space-1);
		min-width: 0;
	}

	.chip {
		min-width: 0;
		height: var(--control-h-sm);
		padding: 0;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--fg-muted);
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.chip:hover {
		background: var(--surface-3);
		color: var(--fg);
	}

	.chip:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.chip.on {
		border-color: var(--primary-border, var(--primary));
		color: var(--primary);
		background: var(--primary-wash);
	}

	@media (max-width: 900px) {
		.chip {
			height: 2.75rem;
		}
	}
</style>
