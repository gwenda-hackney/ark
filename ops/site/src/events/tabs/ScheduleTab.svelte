<script lang="ts">
	/**
	 * A series' Nights tab: the upcoming nights from its pattern, each with
	 * what it changes, and a link to edit it. The pattern itself is under
	 * When on Details.
	 */
	import { Icon } from "../../app/shell";
	import { Button, FormSection } from "../../ui";
	import type { OpsEvent } from "../../app/api";
	import { eventItemPath } from "../../app/nav";
	import type { EventForm } from "../event-form.svelte";

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

	const description = $derived(
		form.repeatUnit === "none"
			? "Each night is added on its own date. A star marks a night with a guest of its own."
			: "From the pattern under When. A night lists what it changes from the series.",
	);
</script>

<FormSection title="Upcoming nights" {description}>
	{#snippet actions()}
		{#if eventId && onaddnight}
			<Button variant="outline" size="sm" type="button" disabled={busy} onclick={onaddnight}>
				{#snippet icon()}<Icon name="plus" size={14} />{/snippet}
				Add night
			</Button>
		{/if}
	{/snippet}
	{#if previewDates.length}
		<ul class="occurrences">
			{#each previewDates as date (date)}
				{@const occurrence = current?.dates.find((row) => row.date === date)}
				{@const special = form.nightIsSpecialEvent(occurrence)}
				{@const details = form.nightDetailLines(current, occurrence, date)}
				<li>
					<div class="occurrence-main">
						<strong class="occurrence-title">
							{#if special}
								<span class="occurrence-special" title="Special event" aria-label="Special event">
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
						<a class="occurrence-link" href={eventItemPath(`${eventId}@${date}`)}>Edit night</a>
					{/if}
				</li>
			{/each}
		</ul>
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

	.occurrences {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr));
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
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: transparent;
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
		font-feature-settings: var(--font-features-num);
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

	.occurrence-link {
		flex-shrink: 0;
		color: var(--primary);
		font-size: var(--text-xs);
		font-weight: 600;
		text-decoration: none;
	}

	.occurrence-link:hover {
		text-decoration: underline;
	}

	@media (max-width: 900px) {
		.occurrence-link {
			display: inline-flex;
			align-items: center;
			min-height: 2.75rem;
		}
	}
</style>
