<script lang="ts">
	/**
	 * Centered modal dialog with backdrop. Escape and backdrop click close.
	 * Portaled to document.body so it is not clipped by transformed panels.
	 */
	import type { Snippet } from "svelte";
	import { fade, scale } from "svelte/transition";
	import { portal } from "./portal";

	function easeOut(t: number): number {
		return 1 - Math.pow(1 - t, 3.2);
	}

	let {
		open = false,
		title,
		onclose,
		children,
		footer,
	}: {
		open?: boolean;
		title: string;
		onclose: () => void;
		children: Snippet;
		footer?: Snippet;
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
	<div class="root" role="presentation" use:portal>
		<button
			type="button"
			class="backdrop"
			aria-label="Close dialog"
			onclick={onclose}
			transition:fade={{ duration: 180, easing: easeOut }}
		></button>
		<div
			class="dialog"
			role="dialog"
			aria-modal="true"
			aria-label={title}
			tabindex="-1"
			in:scale={{ duration: 220, start: 0.96, opacity: 0, easing: easeOut }}
			out:fade={{ duration: 140, easing: easeOut }}
		>
			<header class="head">
				<h2>{title}</h2>
				<button type="button" class="x" aria-label="Close" onclick={onclose}>
					×
				</button>
			</header>
			<div class="body">
				{@render children()}
			</div>
			{#if footer}
				<footer class="foot">{@render footer()}</footer>
			{/if}
		</div>
	</div>
{/if}

<style>
	.root {
		position: fixed;
		inset: 0;
		z-index: 200;
		display: grid;
		place-items: center;
		padding: var(--page-gutter, 1rem);
		pointer-events: none;
	}

	.backdrop {
		position: absolute;
		inset: 0;
		pointer-events: auto;
		border: 0;
		padding: 0;
		margin: 0;
		background: color-mix(in srgb, #0d0d0d 62%, transparent);
		cursor: pointer;
	}

	.dialog {
		position: relative;
		pointer-events: auto;
		display: flex;
		flex-direction: column;
		width: min(28rem, 100%);
		max-height: min(36rem, calc(100vh - 2rem));
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-xl);
		background: var(--card);
		box-shadow: var(--shadow);
		overflow: hidden;
		outline: none;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.9rem 1rem 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--foreground);
	}

	.x {
		display: inline-grid;
		place-content: center;
		width: var(--control-h-sm);
		height: var(--control-h-sm);
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--muted-foreground);
		font: inherit;
		font-size: 1.35rem;
		line-height: 1;
		cursor: pointer;
	}

	.x:hover {
		background: var(--accent);
		color: var(--foreground);
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 1rem;
	}

	.foot {
		display: flex;
		justify-content: flex-end;
		gap: 0.45rem;
		padding: 0.75rem 1rem;
		border-top: 1px solid var(--border);
	}
</style>
