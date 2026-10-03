<script lang="ts">
	/**
	 * The one button. One shape (8px corners) and two sizes: md 36px and sm
	 * 32px, a little taller on phones. A single gold primary per view;
	 * everything else is secondary (outline), ghost, or destructive, so the
	 * eye has one place to land. `outline` is the older name for secondary;
	 * `subtle` and `accent` are kept for old call sites and read as secondary.
	 */
	import type { Snippet } from "svelte";
	import type { HTMLButtonAttributes } from "svelte/elements";

	type Variant =
		| "primary"
		| "secondary"
		| "outline"
		| "subtle"
		| "ghost"
		| "accent"
		| "destructive";
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
	class="btn {variant === 'secondary' ? 'outline' : variant} {size} {className}"
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
		border-radius: var(--radius-md);
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

	/* Disabled reads as a flat, quiet slab, not a faded copy of itself. */
	.btn:disabled {
		border-color: transparent;
		background: var(--surface-3);
		color: var(--fg-subtle);
		box-shadow: none;
		cursor: not-allowed;
	}

	.ghost:disabled {
		background: transparent;
	}

	.btn:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
		border-radius: var(--radius-md);
	}

	.full {
		width: 100%;
	}

	/* ─── Sizes ─── */

	.md {
		height: var(--control-h);
		padding: 0 var(--space-5);
		font-size: var(--text-base);
		gap: var(--space-2);
	}

	.sm {
		height: var(--button-h-sm);
		padding: 0 var(--space-3);
		font-size: var(--text-sm);
		gap: var(--space-2);
	}

	/* Older size: same height as sm so rows line up. */
	.xs {
		height: var(--button-h-sm);
		padding: 0 var(--space-3);
		font-size: var(--text-sm);
		gap: var(--space-1);
	}

	/* MD3: leading-icon buttons tighten start padding, keep end breathing room. */
	.md:has(.glyph):has(.label) {
		padding-inline: var(--space-3) var(--space-4);
	}

	.sm:has(.glyph):has(.label),
	.xs:has(.glyph):has(.label) {
		padding-inline: var(--space-2) var(--space-3);
	}

	.md:not(:has(.label)) {
		width: var(--control-h);
		padding: 0;
	}

	.sm:not(:has(.label)),
	.xs:not(:has(.label)) {
		width: var(--button-h-sm);
		padding: 0;
	}

	/* ─── Variants ─── */

	.primary {
		background: var(--primary);
		color: var(--primary-foreground);
	}

	.primary:hover:not(:disabled) {
		background: var(--primary-hover);
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
		border-color: var(--border-strong);
		background: var(--surface-2);
		color: var(--foreground);
	}

	.subtle:hover:not(:disabled) {
		background: var(--surface-3);
	}

	.ghost {
		color: var(--muted-foreground);
	}

	.ghost:hover:not(:disabled) {
		background: var(--accent);
		color: var(--foreground);
	}

	/* Gold is for primary only now; accent reads as secondary. */
	.accent {
		border-color: var(--border-strong);
		color: var(--foreground);
	}

	.accent:hover:not(:disabled) {
		background: var(--accent);
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

	.sm .glyph,
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
