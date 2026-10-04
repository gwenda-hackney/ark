<script lang="ts">
	/**
	 * Comfortable or compact table rows. Two icon buttons in one track, the
	 * same height as a small button so it sits in a toolbar row.
	 */
	import type { Density } from "./view-prefs";

	let {
		value = $bindable<Density>("comfortable"),
		onchange,
		disabled = false,
		reason,
	}: {
		value?: Density;
		onchange?: (next: Density) => void;
		/** Kept in place but inert, e.g. in cards view ("Only for the table"). */
		disabled?: boolean;
		reason?: string;
	} = $props();

	const OPTIONS: { id: Density; label: string; lines: number[] }[] = [
		{ id: "comfortable", label: "Comfortable rows", lines: [6, 12, 18] },
		{ id: "compact", label: "Compact rows", lines: [5, 9.5, 14.5, 19] },
	];

	function pick(next: Density) {
		if (disabled || next === value) return;
		value = next;
		onchange?.(next);
	}
</script>

<div class="track" class:disabled role="group" aria-label="Row spacing" title={disabled ? reason : undefined}>
	{#each OPTIONS as option (option.id)}
		<button
			type="button"
			class="opt"
			aria-pressed={value === option.id}
			aria-label={option.label}
			aria-disabled={disabled || undefined}
			title={disabled ? reason : option.label}
			onclick={() => pick(option.id)}
		>
			<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
				{#each option.lines as y (y)}
					<path d="M4 {y}h16" />
				{/each}
			</svg>
		</button>
	{/each}
</div>

<style>
	.track {
		display: inline-flex;
		align-items: center;
		gap: 0.125rem;
		height: var(--button-h-sm);
		padding: 0.1875rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--sunken);
	}

	.opt {
		display: inline-grid;
		place-items: center;
		width: calc(var(--button-h-sm) - 0.5rem);
		height: calc(var(--button-h-sm) - 0.5rem);
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: calc(var(--radius-md) - 0.1875rem);
		background: none;
		color: var(--fg-muted);
		cursor: pointer;
		transition:
			background-color var(--t-fast) var(--ease-in-out),
			color var(--t-fast) var(--ease-in-out);
	}

	.track.disabled {
		background: var(--surface-3);
		border-color: transparent;
	}

	.track.disabled .opt {
		color: var(--fg-subtle);
		box-shadow: none;
		background: none;
		cursor: not-allowed;
	}

	.opt:hover:not([aria-pressed="true"], [aria-disabled="true"]) {
		background: var(--surface-3);
		color: var(--fg);
	}

	.opt[aria-pressed="true"] {
		background: var(--surface-3);
		color: var(--fg);
		box-shadow: inset 0 0 0 1px var(--border-strong);
	}

	.opt:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
	}
</style>
