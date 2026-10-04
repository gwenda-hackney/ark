<script lang="ts">
	/**
	 * Pill for filters. Two shapes:
	 * - a toggle (`pressed` set): on/off, like "Show inactive" or a quick date range;
	 * - an active filter (`onremove` set): shows what is applied, × clears it.
	 */
	import type { Snippet } from "svelte";

	let {
		pressed,
		disabled = false,
		onclick,
		onremove,
		removeLabel,
		children,
	}: {
		/** Set to make the chip a toggle button. */
		pressed?: boolean;
		disabled?: boolean;
		onclick?: (event: MouseEvent) => void;
		/** Set to show a remove button. */
		onremove?: () => void;
		/** Screen reader text for the remove button, e.g. "Remove Negroni Chess Society". */
		removeLabel?: string;
		children: Snippet;
	} = $props();
</script>

{#if onremove}
	<span class="chip applied">
		<span class="text">{@render children()}</span>
		<button type="button" class="remove" aria-label={removeLabel || "Remove filter"} {disabled} onclick={onremove}>
			<svg viewBox="0 0 16 16" aria-hidden="true">
				<path d="m4.5 4.5 7 7m0-7-7 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
			</svg>
		</button>
	</span>
{:else}
	<button
		type="button"
		class="chip toggle"
		aria-pressed={pressed === undefined ? undefined : pressed}
		{disabled}
		{onclick}
	>
		{#if pressed}
			<svg class="tick" viewBox="0 0 16 16" aria-hidden="true">
				<path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		{/if}
		<span class="text">{@render children()}</span>
	</button>
{/if}

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		flex-shrink: 0;
		max-width: 100%;
		height: 2rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--fg-muted);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 500;
		white-space: nowrap;
	}

	.toggle {
		padding: 0 var(--space-3);
		cursor: pointer;
		transition:
			background-color var(--t-fast) var(--ease-in-out),
			border-color var(--t-fast) var(--ease-in-out),
			color var(--t-fast) var(--ease-in-out);
	}

	.toggle:hover:not(:disabled) {
		background: var(--surface-3);
		color: var(--fg);
	}

	.toggle[aria-pressed="true"] {
		border-color: var(--primary-border);
		background: var(--primary-wash);
		color: var(--fg);
	}

	.toggle:disabled {
		background: var(--surface-3);
		color: var(--fg-subtle);
		cursor: not-allowed;
	}

	.toggle:focus-visible,
	.remove:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
		border-radius: var(--radius-pill);
	}

	.applied {
		padding: 0 var(--space-1) 0 var(--space-3);
		background: var(--surface-2);
		color: var(--fg);
	}

	.text {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tick {
		width: 0.875rem;
		height: 0.875rem;
		color: var(--primary);
	}

	.remove {
		display: inline-grid;
		place-items: center;
		width: 1.5rem;
		height: 1.5rem;
		padding: 0;
		border: 0;
		border-radius: var(--radius-pill);
		background: none;
		color: var(--fg-muted);
		cursor: pointer;
	}

	.remove:hover {
		background: var(--surface-3);
		color: var(--fg);
	}

	.remove svg {
		width: 0.75rem;
		height: 0.75rem;
	}

	/* Keep in sync with SHELL_MOBILE_MAX_PX. Bigger targets for thumbs. */
	@media (max-width: 900px) {
		.chip {
			height: 2.25rem;
		}

		.remove {
			width: 2rem;
			height: 2rem;
		}
	}
</style>
