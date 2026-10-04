<script lang="ts">
	/**
	 * Slots inside the night (Open decks, Chess), as a section of the form.
	 * Each slot is one row: label, start, end, remove.
	 */
	import { Icon } from "../../app/shell";
	import { Button, FormSection, RowAction, TextField, TimeField } from "../../ui";
	import type { EventForm } from "../event-form.svelte";

	let { form, busy }: { form: EventForm; busy: boolean } = $props();
</script>

<FormSection title="Night schedule" class="sec-slots">
	{#snippet actions()}
		<Button variant="outline" size="sm" type="button" disabled={busy} onclick={() => form.addNightSlot()}>
			{#snippet icon()}<Icon name="plus" size={14} />{/snippet}
			Add slot
		</Button>
	{/snippet}
	{#if form.nightSchedule.length}
		<ul class="slots">
			{#each form.nightSchedule as slot, index (index)}
				<li class="slot reveal-row">
					<TextField
						size="sm"
						placeholder="Open decks"
						bind:value={form.nightSchedule[index].label}
						aria-label={`Slot ${index + 1} name`}
					/>
					<TimeField
						size="sm"
						bind:value={form.nightSchedule[index].startTime}
						aria-label={`Slot ${index + 1} start`}
					/>
					<TimeField
						size="sm"
						bind:value={form.nightSchedule[index].endTime}
						suggest={form.nightSchedule[index].startTime || form.endTime || "23:00"}
						aria-label={`Slot ${index + 1} end`}
					/>
					<RowAction
						label={`Remove slot ${index + 1}`}
						disabled={busy}
						reason="Saving…"
						onclick={() => form.removeNightSlot(index)}
					/>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">No slots. Add open decks, chess, sets, or whatever shapes the night.</p>
	{/if}
</FormSection>

<style>
	.slots {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* Label takes the room; times at their own width; remove at the end. */
	.slot {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 6.75rem 6.75rem auto;
		gap: var(--space-2);
		align-items: center;
	}




	.empty {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--subtle-foreground);
	}

	/* Phones: the name on its own line, the times and remove under it. */
	@container (max-width: 26rem) {
		.slot {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
			padding-bottom: var(--space-2);
			border-bottom: 1px solid var(--border);
		}

		.slot > :global(:first-child) {
			grid-column: 1 / -1;
		}

	}
</style>
