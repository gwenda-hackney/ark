<script lang="ts">
	/**
	 * Right-hand side panel with backdrop. Fades and slides in/out so every
	 * ops drawer feels the same.
	 */
	import type { Snippet } from "svelte";
	import { fade, fly } from "svelte/transition";

	/** Matches theme `--ease` (soft overshoot settle). */
	function easeOut(t: number): number {
		return 1 - Math.pow(1 - t, 3.2);
	}

	let {
		open = false,
		onclose,
		ariaLabel = "Side panel",
		width = "min(24rem, 100%)",
		children,
	}: {
		open?: boolean;
		onclose: () => void;
		ariaLabel?: string;
		width?: string;
		children: Snippet;
	} = $props();
</script>

{#if open}
	<div class="root" style:--side-panel-width={width} role="presentation">
		<button
			type="button"
			class="backdrop"
			aria-label="Close panel"
			onclick={onclose}
			transition:fade={{ duration: 220, easing: easeOut }}
		></button>
		<div
			class="panel"
			role="dialog"
			aria-modal="true"
			aria-label={ariaLabel}
			in:fly={{ x: 40, duration: 340, opacity: 1, easing: easeOut }}
			out:fly={{ x: 32, duration: 240, opacity: 1, easing: easeOut }}
		>
			{@render children()}
		</div>
	</div>
{/if}

<style>
	.root {
		position: absolute;
		inset: 0;
		z-index: 40;
		display: grid;
		grid-template-columns: minmax(0, 1fr) var(--side-panel-width);
		pointer-events: none;
	}

	.backdrop {
		pointer-events: auto;
		border: 0;
		padding: 0;
		margin: 0;
		background: color-mix(in srgb, #0d0d0d 55%, transparent);
		cursor: pointer;
	}

	.panel {
		pointer-events: auto;
		min-width: 0;
		height: 100%;
		border-left: 1px solid var(--border);
		box-shadow: var(--shadow);
		overflow: hidden;
		background: var(--card);
		will-change: transform;
		padding-bottom: env(safe-area-inset-bottom, 0px);
	}

	@media (max-width: 720px) {
		.root {
			grid-template-columns: 0 minmax(0, 1fr);
		}
	}
</style>
