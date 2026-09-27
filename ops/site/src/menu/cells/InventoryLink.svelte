<script lang="ts">
	/**
	 * Name of a stock row. Click stays in the SPA; ⌘-click opens a tab.
	 */
	import { hasRangeSelection } from "../../ui/grid";
	import { navigate } from "../../app/nav";

	let {
		text = "",
		href = "",
		title = "Open in inventory",
		inline = false,
	}: {
		text?: string;
		href?: string;
		title?: string;
		inline?: boolean;
	} = $props();

	function onClick(event: MouseEvent) {
		if (!href) return;
		if (hasRangeSelection()) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		if (event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			event.stopPropagation();
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		navigate(href);
	}
</script>

{#if href}
	<a
		class="inv-link"
		class:inline
		{href}
		{title}
		onclick={onClick}>{text}</a
	>
{:else}
	<span class="inv-text" class:inline>{text}</span>
{/if}

<style>
	.inv-link,
	.inv-text {
		display: block;
		min-width: 0;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: inherit;
		font: inherit;
		font-weight: inherit;
		text-decoration: none;
		line-height: 1.3;
	}

	.inv-link {
		cursor: pointer;
		user-select: text;
	}

	.inv-link:hover {
		color: var(--primary);
		text-decoration: underline;
		text-underline-offset: 0.18em;
	}

	.inv-link:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.inline {
		display: inline;
		overflow: visible;
		text-overflow: unset;
		white-space: normal;
		max-width: none;
	}
</style>
