<script lang="ts">
	/**
	 * The nights on a series' Schedule tab: a calendar of the nights its
	 * pattern makes, marking those that differ from the series, each opening
	 * its night. The pattern itself is under When, above.
	 */
	import { Icon } from "../../app/shell";
	import { Button, FormSection } from "../../ui";
	import type { OpsEvent } from "../../app/api";
	import type { EventForm } from "../event-form.svelte";
	import { scheduleToday } from "../event-schedule";
	import { seriesNights } from "../series-calendar";
	import SeriesCalendar from "../SeriesCalendar.svelte";

	let {
		form,
		current,
		eventId,
		previewDates,
		busy = false,
		onaddnight,
	}: {
		form: EventForm;
		/** The saved event (null while new). */
		current: OpsEvent | null;
		eventId: string;
		/** Upcoming nights from the pattern as typed. */
		previewDates: string[];
		busy?: boolean;
		onaddnight?: () => void;
	} = $props();

	const today = scheduleToday();
	/** Every night of the pattern as typed, past ones too, so earlier months page back. */
	const nights = $derived(
		seriesNights(
			{
				name: form.name,
				artist: form.artist,
				startTime: form.startTime,
				endTime: form.endTime,
				time: form.time,
				repeatUnit: form.repeatUnit,
			},
			{
				dates: form.upcomingDates(current, ""),
				occurrences: current?.dates,
				extraDates: current?.extraDates,
				skippedDates: current?.skippedDates,
			},
		),
	);
</script>

<FormSection title="Upcoming nights" help="Schedule tab">
	{#snippet actions()}
		{#if onaddnight}
			<Button
				variant="outline"
				size="sm"
				type="button"
				disabled={busy || !eventId}
				reason={eventId ? undefined : "Save the series first"}
				onclick={onaddnight}
			>
				{#snippet icon()}<Icon name="plus" size={14} />{/snippet}
				Add night
			</Button>
		{/if}
	{/snippet}
	{#if previewDates.length}
		<SeriesCalendar {nights} {eventId} {today} />
	{:else}
		<p class="hint">
			{form.startsOn
				? form.repeatUnit === "none"
					? "No nights scheduled yet."
					: "No upcoming nights for this pattern."
				: "No first night yet. The website shows this series with “Check back soon for the next date” and a link to our Instagram."}
		</p>
	{/if}
</FormSection>

<style>
	.hint {
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}
</style>
