<script lang="ts">
	/**
	 * Right-hand drawer with backdrop. Portaled to body so it is not clipped
	 * by editor overflow. Escape and backdrop click close.
	 * At the shell mobile breakpoint the panel covers the page.
	 */
	import type { Snippet } from "svelte";
	import { fade, fly } from "svelte/transition";
	import { portal } from "./portal";

	function easeOut(t: number): number {
		return 1 - Math.pow(1 - t, 3.2);
	}

	let {
		open = false,
		onclose,
		ariaLabel = "Side panel",
		width = "min(26rem, 100%)",
		children,
	}: {
		open?: boolean;
		onclose: () => void;
		ariaLabel?: string;
		width?: string;
		children: Snippet;
	} = $props();

	$effect(() => {
		if (!open || typeof window === "undefined") return;
		function onKeydown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				e.preventDefault();
				onclose();
			}
		}
		window.addEventListener("keydown", onKeydown);
		return () => window.removeEventListener("keydown", onKeydown);
	});
</script>

{#if open}
	<div
		class="root"
		style:--side-panel-width={width}
		role="presentation"
		use:portal
	>
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
		position: fixed;
		inset: 0;
		z-index: 180;
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
		display: flex;
		flex-direction: column;
		min-width: 0;
		height: 100%;
		border-left: 1px solid var(--border);
		box-shadow: var(--shadow);
		overflow: hidden;
		background: var(--card);
		will-change: transform;
		padding-bottom: env(safe-area-inset-bottom, 0px);
	}

	/* Keep in sync with SHELL_MOBILE_MAX_PX. Full-page sheet, no side gutter. */
	@media (max-width: 900px) {
		.root {
			grid-template-columns: minmax(0, 1fr);
		}

		.backdrop {
			display: none;
		}

		.panel {
			border-left: 0;
			padding-top: env(safe-area-inset-top, 0px);
		}
	}
</style>
