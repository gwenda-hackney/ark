<script lang="ts">
	/**
	 * Pill tab bar. `invert` keeps the sunken track + ink pill, the same
	 * height as a button of the same size so it sits in a toolbar row.
	 * `soft` is a flat underline strip for sitting on cards (no gray box).
	 *
	 * A tab that's off stays in its place, greyed out (controls never move).
	 * With a `reason` it says why beside its label and as its tooltip, and,
	 * like Button's, can still be hovered and focused, but does nothing.
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
				href={item.disabled ? undefined : item.href}
				role="tab"
				class="tab"
				class:soft-off={item.disabled && item.reason}
				aria-selected={item.id === value}
				aria-disabled={item.disabled || undefined}
				tabindex={item.disabled && !item.reason ? -1 : 0}
				title={item.disabled ? item.reason : undefined}
				onclick={item.disabled ? (e) => e.preventDefault() : undefined}
			>
				<span class="label" data-label={item.label}>{item.label}</span>
				{#if item.count !== undefined}
					<span class="count num pill-text">{item.count}</span>
				{/if}
				{#if item.disabled && item.reason}
					<span class="reason">{item.reason}</span>
				{/if}
			</a>
		{:else}
			<button
				type="button"
				role="tab"
				class="tab"
				class:soft-off={item.disabled && item.reason}
				aria-selected={item.id === value}
				disabled={item.disabled && !item.reason}
				aria-disabled={item.disabled && item.reason ? "true" : undefined}
				title={item.disabled ? item.reason : undefined}
				onclick={() => pick(item)}
			>
				<span class="label" data-label={item.label}>{item.label}</span>
				{#if item.count !== undefined}
					<span class="count num pill-text">{item.count}</span>
				{/if}
				{#if item.disabled && item.reason}
					<span class="reason">{item.reason}</span>
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
		height: var(--control-h);
		padding: 0.1875rem;
		border-radius: var(--radius-pill);
		background: var(--sunken);
		border: 1px solid var(--border);
	}

	.track.sm {
		height: var(--button-h-sm);
	}

	.track.soft {
		height: auto;
		gap: 0.15rem;
		padding: 0;
		border: none;
		border-radius: 0;
		background: transparent;
	}

	.tab {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
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

	/* Equal padding above and below, so the focus ring sits evenly round the
	   label; the underline sits on the bottom edge inside it. */
	.soft .tab {
		position: relative;
		border-radius: var(--radius-sm);
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

	/* Every label keeps room for its bold width, so picking a tab never
	   nudges the others along (controls never move). */
	.label {
		display: inline-grid;
	}

	.label::after {
		content: attr(data-label);
		height: 0;
		overflow: hidden;
		visibility: hidden;
		font-weight: 600;
		user-select: none;
		pointer-events: none;
	}

	/* Track height less its 3px padding and 1px border, each side. */
	.md .tab {
		height: calc(var(--control-h) - 0.5rem);
		padding: 0 var(--space-3);
		font-size: var(--text-base);
	}

	.sm .tab {
		height: calc(var(--button-h-sm) - 0.5rem);
		padding: 0 var(--space-3);
		font-size: var(--text-sm);
	}

	.soft.md .tab {
		height: auto;
		min-height: 2.25rem;
		padding: var(--space-2) var(--space-3);
	}

	.soft.sm .tab {
		height: auto;
		min-height: 2rem;
		padding: var(--space-2) var(--space-2);
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
		color: var(--fg-subtle);
		pointer-events: none;
	}

	/* Off with a reason: hoverable for its tooltip, but it goes nowhere. */
	.tab.soft-off {
		pointer-events: auto;
		cursor: not-allowed;
	}

	.reason {
		font-size: var(--text-2xs);
		font-weight: 400;
		color: var(--fg-subtle);
	}

	.tab:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
		border-radius: var(--radius-pill);
	}

	.soft .tab:focus-visible {
		outline-offset: 0;
		border-radius: var(--radius-md);
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
