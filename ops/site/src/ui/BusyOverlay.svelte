<script lang="ts">
	/**
	 * Blocks a positioned ancestor while an async run is in flight.
	 * Matches trading shell.web: top progress bar, scrim, spinner + label.
	 */
	import { fade } from "svelte/transition";
	import { easeOut, fadeMs } from "./motion";

	let {
		active = false,
		label = "Working…",
	}: {
		active?: boolean;
		label?: string;
	} = $props();
</script>

{#if active}
	<div
		class="busy"
		role="status"
		aria-live="polite"
		aria-busy="true"
		aria-label={label}
		out:fade={{ duration: fadeMs, easing: easeOut }}
	>
		<div class="bar" role="progressbar" aria-hidden="true"></div>
		<div class="veil" aria-hidden="true"></div>
		<p class="status">
			<span class="spin" aria-hidden="true"></span>
			{label}
		</p>
	</div>
{/if}

<style>
	.busy {
		position: absolute;
		inset: 0;
		z-index: 40;
		display: grid;
		place-items: center;
		pointer-events: all;
		cursor: wait;
		border-radius: inherit;
	}

	.bar {
		position: absolute;
		inset: 0 0 auto;
		height: 2px;
		overflow: hidden;
		background: var(--primary-wash);
		border-radius: inherit inherit 0 0;
	}

	.bar::after {
		content: "";
		display: block;
		height: 100%;
		width: 32%;
		background: var(--primary);
		animation: slide 1.1s ease infinite;
	}

	.veil {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: color-mix(in srgb, var(--background) 55%, transparent);
		backdrop-filter: blur(1px);
	}

	.status {
		position: relative;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		padding: var(--space-2) var(--space-4);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-pill);
		background: var(--card);
		color: var(--foreground);
		font-size: var(--text-base);
		font-weight: 500;
		box-shadow: var(--shadow);
	}

	.spin {
		width: 0.875rem;
		height: 0.875rem;
		flex-shrink: 0;
		border: 1.5px solid var(--border-strong);
		border-top-color: var(--primary);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(1turn);
		}
	}

	@keyframes slide {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(350%);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spin,
		.bar::after {
			animation: none;
		}

		.bar::after {
			width: 100%;
			opacity: 0.7;
		}
	}
</style>
