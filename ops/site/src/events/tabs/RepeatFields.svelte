<script lang="ts">
	/**
	 * A series' pattern in the When section: how it repeats, then the first
	 * and last night. Each control is as wide as what goes in it.
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

<div class="field-row">
	<Field
		label="Repeats"
		for="event-unit"
		width="md"
		hint={form.repeatUnit === "none" ? "Add each night on its own date with Add night." : undefined}
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
		<Field
			label="Every"
			for="event-every"
			width="sm"
			error={errors.get("event-every")}
		>
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
			label="Day of month"
			for="event-month-day"
			width="xs"
			optional
			error={errors.get("event-month-day")}
			hint="Blank follows the first night."
		>
			<NumberField id="event-month-day" size="sm" integer min={1} max={31} bind:value={form.monthDay} />
		</Field>
	{/if}
</div>

{#if form.repeatUnit === "week"}
	<Field label="On" class="span-all" hint="Pick more than one for a series that runs several nights a week.">
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

<div class="field-row">
	<Field
		label={form.repeatUnit === "none" ? "First night" : "Starts on"}
		for="event-starts"
		width="sm"
		optional
		error={errors.get("event-starts")}
		hint={form.repeatUnit === "none"
			? "Blank until the first night is booked."
			: "Blank if it isn't fixed yet. The website says to check back soon."}
	>
		<DateField id="event-starts" size="sm" bind:value={form.startsOn} />
	</Field>
	{#if form.repeatUnit !== "none"}
		<Field
			label="Ends on"
			for="event-ends"
			width="sm"
			optional={!form.startsOn}
			error={errors.get("event-ends")}
			hint="The last night. Needed once it has a start."
		>
			<DateField id="event-ends" size="sm" bind:value={form.endsOn} min={form.startsOn} />
		</Field>
	{/if}
</div>

<style>
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.chip {
		min-width: 3.25rem;
		height: var(--control-h-sm);
		padding: 0 var(--space-3);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--foreground);
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.chip:hover {
		background: var(--surface-3);
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
			min-width: 2.75rem;
		}
	}
</style>
