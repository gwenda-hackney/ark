<script lang="ts">
	/**
	 * The one button. Pill shaped like the reference: a single solid gold
	 * primary per view, everything else outlined or ghost so the eye has one
	 * place to land.
	 */
	import type { Snippet } from "svelte";
	import type { HTMLButtonAttributes } from "svelte/elements";

	type Variant = "primary" | "outline" | "subtle" | "ghost" | "accent" | "destructive";
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
	class:icon-only={!children && !!icon}
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
		flex-shrink: 0;
		border: 1px solid transparent;
		border-radius: var(--radius-pill);
		background: transparent;
		font-weight: 500;
		white-space: nowrap;
		line-height: 1;
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
		font-size: var(--text);
		gap: 0.5rem;
	}

	.sm {
		height: var(--control-h-sm);
		padding: 0 1rem;
		font-size: var(--text);
		gap: 0.5rem;
	}

	.xs {
		height: var(--control-h-xs);
		padding: 0 0.75rem;
		font-size: var(--text-sm);
		gap: 0.375rem;
	}

	/* MD3: leading-icon buttons tighten start padding, keep end breathing room. */
	.md:has(.glyph):has(.label) {
		padding-inline: 0.875rem 1.125rem;
	}

	.sm:has(.glyph):has(.label) {
		padding-inline: 0.75rem 1rem;
	}

	.xs:has(.glyph):has(.label) {
		padding-inline: 0.625rem 0.75rem;
	}

	.md:not(:has(.label)) {
		width: var(--control-h);
		padding: 0;
	}

	.sm:not(:has(.label)) {
		width: var(--control-h-sm);
		padding: 0;
	}

	.xs:not(:has(.label)) {
		width: var(--control-h-xs);
		padding: 0;
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

	.accent {
		border-color: color-mix(in srgb, var(--primary) 45%, transparent);
		background: var(--primary-wash);
		color: var(--primary);
	}

	.accent:hover:not(:disabled) {
		border-color: var(--primary);
		background: var(--primary-wash-strong);
		color: var(--primary-hover);
	}

	.destructive {
		background: var(--destructive);
		color: var(--destructive-foreground);
	}

	.destructive:hover:not(:disabled) {
		background: var(--destructive-hover);
	}

	/* ─── Content ─── */

	/*
	  Fixed icon box (MD3 ~20dp on default, scales with control size) so SVG
	  viewBoxes centre on the label, independent of whatever size="" the call
	  site passed into Icon.
	*/
	.glyph {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		line-height: 0;
	}

	.md .glyph {
		width: 1.25rem;
		height: 1.25rem;
	}

	.sm .glyph {
		width: 1.125rem;
		height: 1.125rem;
	}

	.xs .glyph {
		width: 1rem;
		height: 1rem;
	}

	.glyph :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}

	.label {
		display: inline-flex;
		align-items: center;
		min-width: 0;
		line-height: 1;
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
