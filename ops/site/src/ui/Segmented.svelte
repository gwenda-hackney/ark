<script lang="ts">
	/**
	 * Pill tab bar. `invert` keeps the sunken track + ink pill.
	 * `soft` is a flat underline strip for sitting on cards (no gray box).
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
		{#if item.href}
			<a
				href={item.href}
				role="tab"
				class="tab"
				aria-selected={item.id === value}
				aria-disabled={item.disabled || undefined}
				tabindex={item.disabled ? -1 : 0}
				onclick={item.disabled ? (e) => e.preventDefault() : undefined}
			>
				<span>{item.label}</span>
				{#if item.count !== undefined}
					<span class="count num">{item.count}</span>
				{/if}
			</a>
		{:else}
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
		{/if}
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

	.track.soft {
		gap: 0.15rem;
		padding: 0;
		border: none;
		border-radius: 0;
		background: transparent;
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
		font-family: inherit;
		white-space: nowrap;
		text-decoration: none;
		cursor: pointer;
		transition:
			background-color var(--t) var(--ease-in-out),
			color var(--t) var(--ease-in-out),
			box-shadow var(--t) var(--ease);
	}

	.soft .tab {
		position: relative;
		border-radius: var(--radius-sm);
		padding-bottom: 0.35rem;
		margin-bottom: -1px;
	}

	.soft .tab::after {
		content: "";
		position: absolute;
		left: 0.35rem;
		right: 0.35rem;
		bottom: 0;
		height: 2px;
		border-radius: 1px;
		background: transparent;
		transition: background-color var(--t) var(--ease-in-out);
	}

	.tab[aria-selected="true"] {
		font-weight: 600;
	}

	.md .tab {
		height: 1.875rem;
		padding: 0 0.8125rem;
		font-size: var(--text);
	}

	.sm .tab {
		height: 1.625rem;
		padding: 0 0.6875rem;
		font-size: var(--text-sm);
	}

	.soft.md .tab {
		height: auto;
		min-height: 1.875rem;
		padding: 0.2rem 0.55rem 0.45rem;
	}

	.soft.sm .tab {
		height: auto;
		min-height: 1.5rem;
		padding: 0.15rem 0.45rem 0.4rem;
	}

	.tab:hover:not(:disabled):not([aria-disabled="true"]):not([aria-selected="true"]) {
		color: var(--foreground);
		background: var(--accent);
	}

	.soft .tab:hover:not(:disabled):not([aria-disabled="true"]):not([aria-selected="true"]) {
		background: transparent;
		color: var(--foreground);
	}

	.tab:disabled,
	.tab[aria-disabled="true"] {
		opacity: 0.4;
		pointer-events: none;
	}

	.invert .tab[aria-selected="true"] {
		background: var(--foreground);
		color: var(--background);
		box-shadow: var(--shadow-sm);
	}

	.soft .tab[aria-selected="true"] {
		background: transparent;
		color: var(--foreground);
		box-shadow: none;
	}

	.soft .tab[aria-selected="true"]::after {
		background: var(--primary);
	}

	.count {
		font-size: var(--text-xs);
		opacity: 0.7;
	}

	.tab[aria-selected="true"] .count {
		opacity: 1;
	}
</style>
