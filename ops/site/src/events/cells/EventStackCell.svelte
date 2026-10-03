<script lang="ts">
	import { hasRangeSelection } from "../../ui/grid";
	import { navigate } from "../../app/nav";

	let {
		eyebrow = "",
		title = "",
		subtitle = "",
		href = "",
	}: {
		eyebrow?: string;
		title?: string;
		subtitle?: string;
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

<div class="stack">
	{#if eyebrow}
		<span class="eyebrow">{eyebrow}</span>
	{/if}
	{#if href}
		<a class="title" {href} onclick={onClick}>{title}</a>
	{:else}
		<span class="title">{title}</span>
	{/if}
	{#if subtitle}
		<span class="sub" title={subtitle}>{subtitle}</span>
	{/if}
</div>

<style>
	.stack {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.12rem;
		min-width: 0;
		width: 100%;
	}

	.eyebrow {
		color: var(--muted-foreground);
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		line-height: 1.2;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.title {
		display: block;
		min-width: 0;
		overflow: hidden;
		color: inherit;
		font-weight: 500;
		line-height: 1.3;
		text-decoration: none;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	a.title:hover {
		color: var(--primary);
	}

	.sub {
		min-width: 0;
		overflow: hidden;
		color: var(--muted-foreground);
		font-size: var(--text-xs);
		line-height: 1.3;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Phones: the scale's list row — 14px title, 13px muted second line. */
	@media (max-width: 900px) {
		.title {
			font-size: var(--text-base);
		}

		.sub {
			font-size: var(--text-sm);
		}
	}
</style>
