<script lang="ts">
	/**
	 * Inventory name as a real link. The rest of the row stays copyable;
	 * drag-select on the name itself does not navigate.
	 */
	import { hasRangeSelection } from "../../ui/grid";
	import { inventoryItemPath } from "../../app/nav";
	import type { InventoryItem } from "../types";
	import HighlightText from "../../ui/HighlightText.svelte";

	let {
		item = null,
		query = "",
		onview,
	}: {
		item?: InventoryItem | null;
		query?: string;
		onview: (item: InventoryItem) => void;
	} = $props();

	const href = $derived(item?.name ? inventoryItemPath(item.name) : "");
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
	{#if href}
		<a class="name" {href} onclick={onClick}
			><HighlightText text={label} {query} /></a
		>
	{:else}
		<button class="name" type="button" onclick={onClick}
			><HighlightText text={label} {query} /></button
		>
	{/if}
{/if}

<style>
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
</style>
