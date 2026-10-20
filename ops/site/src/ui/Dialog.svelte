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
		sheet = false,
		size = "md",
		title,
		onclose,
		children,
		footer,
	}: {
		open?: boolean;
		/** On phones, rise from the bottom as a sheet instead of a centred box. */
		sheet?: boolean;
		/** "lg" for a dialog that holds a form, like the Add wizard. */
		size?: "md" | "lg";
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

	/** Closing removes the overlay under the cursor; block the click that would fall through. */
	function closeWithoutClickThrough(event?: Event) {
		event?.preventDefault();
		event?.stopPropagation();
		onclose();
		if (typeof document === "undefined") return;
		const block = (ev: Event) => {
			ev.preventDefault();
			ev.stopPropagation();
		};
		document.addEventListener("click", block, true);
		document.addEventListener("pointerup", block, true);
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				document.removeEventListener("click", block, true);
				document.removeEventListener("pointerup", block, true);
			});
		});
	}
</script>

{#if open}
	<div class="root" class:sheet role="presentation" use:portal>
		<button
			type="button"
			class="backdrop"
			aria-label="Close dialog"
			onclick={closeWithoutClickThrough}
		></button>
		<div
			class="dialog"
			class:lg={size === "lg"}
			role="dialog"
			aria-modal="true"
			aria-label={title}
			tabindex="-1"
			in:scale={{ duration: 220, start: 0.96, opacity: 0, easing: easeOut }}
			out:fade={{ duration: 140, easing: easeOut }}
		>
			<header class="head">
				<h2>{title}</h2>
				<button
					type="button"
					class="x"
					aria-label="Close"
					onclick={closeWithoutClickThrough}
				>
					×
				</button>
			</header>
			<div class="body scrollbar-fade">
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
		padding: var(--page-gutter);
		pointer-events: none;
	}

	.backdrop {
		position: absolute;
		inset: 0;
		pointer-events: auto;
		border: 0;
		padding: 0;
		margin: 0;
		background: color-mix(in srgb, var(--bg) 62%, transparent);
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
		background: var(--surface-2);
		box-shadow: var(--shadow-pop);
		overflow: hidden;
		outline: none;
	}

	/* A fixed height, so a form's buttons stay put from step to step. */
	.dialog.lg {
		width: min(42rem, 100%);
		height: min(44rem, calc(100vh - 2rem));
		max-height: none;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-4) var(--space-3);
		border-bottom: 1px solid var(--border);
	}

	h2 {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: 600;
		line-height: var(--leading-lg);
		letter-spacing: var(--tracking-lg);
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
		font-size: var(--text-lg);
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
		padding: var(--space-4);
	}

	.foot {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border-top: 1px solid var(--border);
	}

	/* Keep in sync with SHELL_MOBILE_MAX_PX: a sheet along the bottom, clear of the home bar. */
	@media (max-width: 900px) {
		.root.sheet {
			place-items: end stretch;
			padding: 0;
		}

		.root.sheet .dialog {
			width: 100%;
			max-height: calc(100dvh - 2.5rem);
			border-bottom: 0;
			border-radius: var(--radius-xl) var(--radius-xl) 0 0;
		}

		.root.sheet .foot {
			padding-bottom: max(var(--space-3), env(safe-area-inset-bottom, 0px));
		}

		.root.sheet .foot :global(.btn) {
			min-height: 2.75rem;
		}
	}
</style>
