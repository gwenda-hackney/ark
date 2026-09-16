<script lang="ts">
	/**
	 * Label above control, optional live helper below. Descriptions sit behind
	 * a ? tip so the form stays clean. Optional `actions` ride the label row.
	 * Tips open on hover/focus and on tap (mobile has no hover).
	 */
	import { onMount, type Snippet } from "svelte";

	let {
		label,
		hint,
		tooltip,
		for: htmlFor,
		actions,
		children,
	}: {
		label: string;
		hint?: string;
		tooltip?: string;
		for?: string;
		actions?: Snippet;
		children: Snippet;
	} = $props();

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
		if (!tooltip) return;
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

<div class="field">
	<div class="label-row">
		<div class="label-left">
			<label for={htmlFor}>{label}</label>
			{#if tooltip}
				<span
					class="tip-wrap"
					class:open={tipOpen}
					bind:this={tipWrapEl}
				>
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
			{/if}
		</div>
		{#if actions}
			<div class="label-actions">{@render actions()}</div>
		{/if}
	</div>
	{@render children()}
	{#if hint}
		<p class="hint">{hint}</p>
	{/if}
</div>

<style>
	.field {
		display: grid;
		/*
		  Pack to the top. A field stretched by a taller neighbour would otherwise
		  spread the slack across its rows and float its control off the line the
		  other controls in the row sit on.
		*/
		align-content: start;
		gap: 0.375rem;
		min-width: 0;
	}

	.label-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		min-width: 0;
		/* Match tip / compact action height so neighbouring fields share a baseline. */
		min-height: var(--control-h-xs);
	}

	.label-left {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
	}

	label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--muted-foreground);
	}

	.label-actions {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	/* Field actions stay compact but readable — gold icon tools, not micro glyphs. */
	.label-actions :global(.btn) {
		min-height: var(--control-h-xs);
		height: var(--control-h-xs);
	}

	.label-actions :global(.btn.icon-only) {
		width: var(--control-h-xs);
		padding: 0;
	}

	.label-actions :global(.btn:not(.icon-only)) {
		width: auto;
		padding: 0 0.55rem;
	}

	.label-actions :global(.btn .glyph) {
		width: 1rem;
		height: 1rem;
	}

	.label-actions :global(.btn svg) {
		width: 1rem;
		height: 1rem;
	}

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
		padding: 0.45rem 0.6rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--border-strong);
		background: var(--card);
		color: var(--foreground);
		font-size: var(--text-xs);
		font-weight: 450;
		line-height: 1.4;
		box-shadow: var(--shadow-md, var(--shadow-sm));
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

	.hint {
		font-size: var(--text-xs);
		line-height: 1.45;
		color: var(--subtle-foreground);
	}
</style>
