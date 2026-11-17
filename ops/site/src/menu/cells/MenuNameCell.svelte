<script lang="ts">
	/**
	 * A menu's name as a real link to its page, with a quieter line under it
	 * (its pop-up kitchen). Drag-selecting the name doesn't open it.
	 */
	import { hasRangeSelection } from "../../ui/grid";
	import { navigate } from "../../app/nav";

	let {
		name = "",
		note = "",
		href = "",
	}: {
		name?: string;
		note?: string;
		href?: string;
	} = $props();

	function onClick(event: MouseEvent) {
		if (!href) return;
		if (hasRangeSelection()) {
			event.preventDefault();
			return;
		}
		if (event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		event.stopPropagation();
		navigate(href);
	}
</script>

<span class="stack">
	<a class="name" {href} onclick={onClick}>{name || "Untitled"}</a>
	{#if note}<span class="note">{note}</span>{/if}
</span>

<style>
	.stack {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.1rem;
		min-width: 0;
		height: 100%;
		line-height: 1.25;
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 500;
		color: var(--fg);
		text-decoration: none;
	}

	.name:hover {
		color: var(--primary);
		text-decoration: underline;
	}

	.note {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}
</style>
