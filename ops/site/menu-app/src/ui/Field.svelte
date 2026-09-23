<script lang="ts">
	/**
	 * Label above control, optional live helper below. Descriptions sit behind
	 * a ? tip so the form stays clean. Optional `actions` ride the label row.
	 */
	import type { Snippet } from "svelte";
	import Tip from "./Tip.svelte";

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
</script>

<div class="field">
	<div class="label-row">
		<div class="label-left">
			<label for={htmlFor}>{label}</label>
			{#if tooltip}
				<Tip {label} {tooltip} />
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

	/* Field actions: quiet icon tools on the label row, not mini FABs. */
	.label-actions :global(.btn) {
		min-height: 1.375rem;
		height: 1.375rem;
	}

	.label-actions :global(.btn.icon-only),
	.label-actions :global(.btn:not(:has(.label))) {
		width: 1.375rem;
		padding: 0;
	}

	.label-actions :global(.btn:has(.label)) {
		width: auto;
		padding: 0 0.45rem;
	}

	.label-actions :global(.btn .glyph) {
		width: 0.875rem;
		height: 0.875rem;
	}

	.label-actions :global(.btn svg) {
		width: 0.875rem;
		height: 0.875rem;
	}

	.hint {
		font-size: var(--text-xs);
		line-height: 1.45;
		color: var(--subtle-foreground);
	}
</style>
