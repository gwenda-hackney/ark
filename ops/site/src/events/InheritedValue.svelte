<script lang="ts">
	/**
	 * A night's field that follows its series: the series' value, read-only,
	 * marked "From series". The field's Override action swaps in the control.
	 */
	import { Badge } from "../ui";

	let {
		value,
		empty = false,
		prose = false,
	}: {
		/** What the night shows: the series' value, or that the series has none. */
		value: string;
		/** The series has no value: show it quieter. */
		empty?: boolean;
		/** Long text (descriptions, notes): a few lines, then it scrolls. */
		prose?: boolean;
	} = $props();
</script>

<div class="inherited" class:prose>
	<span class="value" class:empty>{value}</span>
	<Badge label="From series" />
</div>

<style>
	.inherited {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		min-width: 0;
		min-height: var(--control-h-sm);
		padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3);
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius-md);
		background: transparent;
		font-size: var(--text-base);
		color: var(--fg-muted);
	}

	.value {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.value.empty {
		color: var(--fg-subtle);
	}

	.prose {
		align-items: flex-start;
		padding-top: var(--space-2);
		padding-bottom: var(--space-2);
	}

	.prose .value {
		white-space: pre-wrap;
		max-height: 7.5rem;
		overflow: auto;
		font-size: var(--text-sm);
		line-height: var(--leading-sm, 1.125rem);
	}

	@media (max-width: 900px) {
		.inherited {
			min-height: 2.5rem;
		}
	}
</style>
