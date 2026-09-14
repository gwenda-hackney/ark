<script lang="ts">
	/**
	 * Label above control, helper line below. One wrapper for every form row so
	 * label size, casing and spacing cannot drift between pages.
	 */
	import type { Snippet } from "svelte";

	let {
		label,
		hint,
		for: htmlFor,
		children,
	}: {
		label: string;
		hint?: string;
		for?: string;
		children: Snippet;
	} = $props();
</script>

<div class="field">
	<label for={htmlFor}>{label}</label>
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

	label {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--muted-foreground);
	}

	.hint {
		font-size: 0.6875rem;
		line-height: 1.45;
		color: var(--subtle-foreground);
	}
</style>
