<script lang="ts">
	/**
	 * Pill tab bar. `invert` is the reference look — the active pill flips to the
	 * ink colour, so it reads the same in both themes without a third colour.
	 */
	import type { SegmentedItem } from "./types";

	let {
		value = $bindable(""),
		items,
		tone = "invert",
		size = "md",
		ariaLabel,
		onChange,
	}: {
		value?: string;
		items: readonly SegmentedItem[];
		tone?: "invert" | "soft";
		size?: "md" | "sm";
		ariaLabel?: string;
		onChange?: (id: string) => void;
	} = $props();

	function pick(item: SegmentedItem): void {
		if (item.disabled || item.id === value) return;
		value = item.id;
		onChange?.(item.id);
	}
</script>

<div class="track {tone} {size}" role="tablist" aria-label={ariaLabel}>
	{#each items as item (item.id)}
		<button
			type="button"
			role="tab"
			class="tab"
			aria-selected={item.id === value}
			disabled={item.disabled}
			onclick={() => pick(item)}
		>
			<span>{item.label}</span>
			{#if item.count !== undefined}
				<span class="count num">{item.count}</span>
			{/if}
		</button>
	{/each}
</div>

<style>
	.track {
		display: inline-flex;
		align-items: center;
		gap: 0.125rem;
		padding: 0.1875rem;
		border-radius: var(--radius-pill);
		background: var(--sunken);
		border: 1px solid var(--border);
	}

	.tab {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		border: none;
		border-radius: var(--radius-pill);
		background: none;
		color: var(--muted-foreground);
		font-weight: 500;
		white-space: nowrap;
		transition:
			background-color var(--t) var(--ease-in-out),
			color var(--t) var(--ease-in-out),
			box-shadow var(--t) var(--ease);
	}

	.md .tab {
		height: 1.875rem;
		padding: 0 0.8125rem;
		font-size: 0.8125rem;
	}

	.sm .tab {
		height: 1.625rem;
		padding: 0 0.6875rem;
		font-size: 0.75rem;
	}

	.tab:hover:not(:disabled):not([aria-selected="true"]) {
		color: var(--foreground);
		background: var(--accent);
	}

	.tab:disabled {
		opacity: 0.4;
		pointer-events: none;
	}

	.invert .tab[aria-selected="true"] {
		background: var(--foreground);
		color: var(--background);
		box-shadow: var(--shadow-sm);
	}

	.soft .tab[aria-selected="true"] {
		background: var(--card);
		color: var(--foreground);
		box-shadow: var(--shadow-sm);
	}

	.count {
		font-size: 0.6875rem;
		opacity: 0.7;
	}
</style>
