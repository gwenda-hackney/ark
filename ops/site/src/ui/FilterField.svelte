<script lang="ts">
	/**
	 * One labelled filter inside FilterBar. Inline on desktop the label sits
	 * before the control; in the phone sheet it sits above it.
	 */
	import type { Snippet } from "svelte";

	let {
		label,
		for: forId,
		children,
	}: {
		label: string;
		/** The control's id. Leave out for groups (chips), which get a role="group". */
		for?: string;
		children: Snippet;
	} = $props();
</script>

{#if forId}
	<div class="filter-field">
		<label class="filter-label" for={forId}>{label}</label>
		<div class="filter-control">{@render children()}</div>
	</div>
{:else}
	<div class="filter-field" role="group" aria-label={label}>
		<span class="filter-label" aria-hidden="true">{label}</span>
		<div class="filter-control">{@render children()}</div>
	</div>
{/if}

<style>
	.filter-field {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}

	.filter-label {
		flex-shrink: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
		white-space: nowrap;
	}

	.filter-control {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
		min-width: 0;
	}

	/* Phone sheet: label above, control full width. */
	:global(.filter-sheet) .filter-field {
		flex-direction: column;
		align-items: stretch;
		gap: var(--space-2);
	}

	:global(.filter-sheet) .filter-label {
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
	}

	:global(.filter-sheet) .filter-control > :global(*) {
		flex: 1 1 auto;
	}

	:global(.filter-sheet) .filter-control > :global(.chip) {
		flex: 0 0 auto;
	}
</style>
