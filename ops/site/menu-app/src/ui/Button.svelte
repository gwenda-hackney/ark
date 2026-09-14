<script lang="ts">
	/**
	 * The one button. Pill shaped like the reference: a single solid gold
	 * primary per view, everything else outlined or ghost so the eye has one
	 * place to land.
	 */
	import type { Snippet } from "svelte";
	import type { HTMLButtonAttributes } from "svelte/elements";

	type Variant = "primary" | "outline" | "subtle" | "ghost" | "destructive";
	type Size = "md" | "sm" | "xs";

	let {
		variant = "primary",
		size = "md",
		type = "button",
		busy = false,
		full = false,
		icon,
		trailing,
		children,
		class: className = "",
		...rest
	}: HTMLButtonAttributes & {
		variant?: Variant;
		size?: Size;
		busy?: boolean;
		/** Stretch to the container — used in drawers and empty states. */
		full?: boolean;
		icon?: Snippet;
		trailing?: Snippet;
		children?: Snippet;
	} = $props();
</script>

<button
	{type}
	class="btn {variant} {size} {className}"
	class:full
	class:busy
	aria-busy={busy || undefined}
	{...rest}
>
	{#if icon}
		<span class="glyph">{@render icon()}</span>
	{/if}
	{#if children}
		<span class="label">{@render children()}</span>
	{/if}
	{#if trailing}
		<span class="glyph">{@render trailing()}</span>
	{/if}
</button>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		flex-shrink: 0;
		border: 1px solid transparent;
		border-radius: var(--radius-pill);
		background: transparent;
		font-weight: 500;
		white-space: nowrap;
		-webkit-user-select: none;
		user-select: none;
		transition:
			background-color var(--t-fast) var(--ease-in-out),
			border-color var(--t-fast) var(--ease-in-out),
			color var(--t-fast) var(--ease-in-out),
			box-shadow var(--t) var(--ease),
			transform var(--t-fast) var(--ease);
	}

	.btn:active:not(:disabled) {
		transform: scale(0.975);
	}

	.btn:disabled {
		opacity: 0.45;
		pointer-events: none;
	}

	.full {
		width: 100%;
	}

	/* ─── Sizes ─── */

	.md {
		height: var(--control-h);
		padding: 0 1.125rem;
		font-size: 0.8125rem;
	}

	.sm {
		height: var(--control-h-sm);
		padding: 0 0.875rem;
		font-size: 0.8125rem;
	}

	.xs {
		height: var(--control-h-xs);
		padding: 0 0.6875rem;
		font-size: 0.75rem;
	}

	/* ─── Variants ─── */

	.primary {
		background: var(--primary);
		color: var(--primary-foreground);
		box-shadow: var(--shadow-sm);
	}

	.primary:hover:not(:disabled) {
		background: var(--primary-hover);
		box-shadow: var(--shadow-primary);
	}

	.outline {
		border-color: var(--border-strong);
		color: var(--foreground);
	}

	.outline:hover:not(:disabled) {
		background: var(--accent);
		border-color: var(--border-strong);
	}

	.subtle {
		background: var(--muted);
		color: var(--foreground);
	}

	.subtle:hover:not(:disabled) {
		background: var(--accent);
	}

	.ghost {
		color: var(--muted-foreground);
	}

	.ghost:hover:not(:disabled) {
		background: var(--accent);
		color: var(--foreground);
	}

	.destructive {
		background: var(--destructive);
		color: var(--destructive-foreground);
	}

	.destructive:hover:not(:disabled) {
		background: var(--destructive-hover);
	}

	/* ─── Content ─── */

	.glyph {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.label {
		display: inline-flex;
		align-items: center;
		min-width: 0;
	}

	/* A run in flight pulses rather than swapping in a spinner, so the button
	   keeps its width and the row does not reflow. */
	.busy .label {
		animation: pulse 1.4s var(--ease-in-out) infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.55;
		}
	}
</style>
