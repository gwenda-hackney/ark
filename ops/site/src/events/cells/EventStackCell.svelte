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

	/** "Sunday · 4 Oct": the day leads in gold, the date follows quieter. */
	const day = $derived(eyebrow.split(" · ")[0] || "");
	const rest = $derived(eyebrow.split(" · ").slice(1).join(" · "));

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
		<span class="when"><span class="day">{day}</span>{#if rest}<span class="date">{rest}</span>{/if}</span>
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

	.when {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		margin-bottom: 0.125rem;
		line-height: 1.25;
		white-space: nowrap;
	}

	.day {
		color: var(--primary);
		font-size: var(--text-md);
		font-weight: 600;
	}

	.date {
		color: var(--fg-muted);
		font-size: var(--text-sm);
		font-weight: 500;
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

		.day {
			font-size: var(--text-base);
		}
	}
</style>
