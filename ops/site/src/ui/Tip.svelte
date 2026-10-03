<script lang="ts">
	/** Quiet ? control. Opens on hover, focus, or tap. */
	import { onMount } from "svelte";

	let { label, tooltip }: { label: string; tooltip: string } = $props();

	let tipOpen = $state(false);
	let tipWrapEl = $state<HTMLSpanElement | undefined>();

	function toggleTip(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		tipOpen = !tipOpen;
	}

	function onTipBlur(e: FocusEvent) {
		const next = e.relatedTarget as Node | null;
		if (next && tipWrapEl?.contains(next)) return;
		tipOpen = false;
	}

	onMount(() => {
		function onDocPointer(e: Event) {
			if (!tipOpen) return;
			const target = e.target as Node | null;
			if (target && tipWrapEl?.contains(target)) return;
			tipOpen = false;
		}
		document.addEventListener("pointerdown", onDocPointer);
		return () => document.removeEventListener("pointerdown", onDocPointer);
	});
</script>

<span class="tip-wrap" class:open={tipOpen} bind:this={tipWrapEl}>
	<button
		type="button"
		class="tip-btn"
		aria-label="About {label}"
		aria-expanded={tipOpen}
		onclick={toggleTip}
		onblur={onTipBlur}
	>
		?
	</button>
	<span class="tip" role="tooltip">{tooltip}</span>
</span>

<style>
	.tip-wrap {
		position: relative;
		display: inline-flex;
		flex-shrink: 0;
		z-index: 1;
	}

	.tip-wrap.open {
		z-index: 80;
	}

	.tip-btn {
		display: inline-grid;
		place-content: center;
		width: 1.125rem;
		height: 1.125rem;
		padding: 0;
		border: 1px solid color-mix(in srgb, var(--muted-foreground) 45%, transparent);
		border-radius: 50%;
		background: transparent;
		color: var(--muted-foreground);
		font: inherit;
		font-size: var(--text-xs);
		font-weight: 600;
		line-height: 1;
		cursor: help;
		-webkit-tap-highlight-color: transparent;
	}

	.tip-btn:hover,
	.tip-btn:focus-visible,
	.tip-wrap.open .tip-btn {
		color: var(--primary);
		border-color: var(--primary);
		outline: none;
	}

	.tip {
		position: absolute;
		left: 0;
		top: calc(100% + 0.4rem);
		z-index: 80;
		width: max-content;
		max-width: min(18rem, calc(100vw - 2rem));
		padding: var(--space-2) var(--space-2);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-strong);
		background: var(--card);
		color: var(--foreground);
		font-size: var(--text-xs);
		font-weight: 400;
		line-height: 1.4;
		box-shadow: var(--shadow-pop);
		opacity: 0;
		visibility: hidden;
		transform: translateY(-0.15rem);
		pointer-events: none;
		transition:
			opacity var(--t-fast) var(--ease-in-out),
			transform var(--t-fast) var(--ease-in-out),
			visibility var(--t-fast) var(--ease-in-out);
	}

	.tip-wrap:hover .tip,
	.tip-wrap:focus-within .tip,
	.tip-wrap.open .tip {
		opacity: 1;
		visibility: visible;
		transform: translateY(0);
	}
</style>
