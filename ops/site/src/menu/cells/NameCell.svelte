<script lang="ts">
	/**
	 * Drink name as a real link. The rest of the row stays copyable;
	 * drag-select on the name itself does not navigate.
	 * When search hits a field that is not a column, a snippet sits under
	 * the name so the match is not invisible.
	 */
	import { hasRangeSelection } from "../../ui/grid";
	import { menuItemPath } from "../../app/nav";
	import type { MatchHint } from "../../ui/search";
	import type { MenuItem } from "../types";
	import HighlightText from "../../ui/HighlightText.svelte";

	let {
		item = null,
		query = "",
		hint = null,
		onview,
	}: {
		item?: MenuItem | null;
		query?: string;
		hint?: MatchHint | null;
		onview: (item: MenuItem) => void;
	} = $props();

	const href = $derived(item?.name ? menuItemPath(item.name) : "");
	const label = $derived(item?.name || "Untitled");

	function onClick(event: MouseEvent) {
		if (hasRangeSelection()) {
			event.preventDefault();
			return;
		}
		if (!item) return;
		if (event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		onview(item);
	}
</script>

{#if item}
	<div class="stack">
		{#if href}
			<a class="name" {href} onclick={onClick}
				><HighlightText text={label} {query} /></a
			>
		{:else}
			<button class="name" type="button" onclick={onClick}
				><HighlightText text={label} {query} /></button
			>
		{/if}
		{#if hint}
			<p class="hint">
				<span class="hint-label">{hint.label}</span>
				<HighlightText text={hint.text} {query} />
			</p>
		{/if}
	</div>
{/if}

<style>
	.stack {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.12rem;
		min-width: 0;
		width: 100%;
		height: 100%;
	}

	.name {
		display: block;
		max-width: 100%;
		margin: 0;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		font-weight: 500;
		text-align: left;
		text-decoration: none;
		line-height: 1.3;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		cursor: pointer;
		user-select: text;
	}

	.name:hover {
		color: var(--primary);
		text-decoration: underline;
		text-underline-offset: 0.18em;
	}

	.name:focus-visible {
		outline: none;
	}

	.hint {
		margin: 0;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--text-xs);
		line-height: 1.3;
		font-weight: 400;
		color: var(--muted-foreground);
	}

	.hint-label {
		margin-right: 0.4em;
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--subtle-foreground);
	}
</style>
