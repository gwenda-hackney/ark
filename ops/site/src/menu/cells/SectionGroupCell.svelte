<script lang="ts">
	import Badge from "../../ui/Badge.svelte";

	let {
		title = "",
		subtitle,
		count = 0,
	}: {
		title?: string;
		subtitle?: string;
		count?: number;
	} = $props();
</script>

<div class="group">
	{#if subtitle}
		<p class="chapter">{subtitle}</p>
	{/if}
	<div class="row">
		<h3>{title}</h3>
		<Badge label={String(count)} title="{count} item{count === 1 ? '' : 's'}" />
	</div>
</div>

<style>
	.group {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.1rem;
		width: 100%;
		height: 100%;
		padding: 0 var(--page-gutter);
		box-sizing: border-box;
	}

	.chapter {
		margin: 0;
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
		line-height: 1.2;
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
	}

	h3 {
		margin: 0;
		font-size: var(--text-sm);
		line-height: var(--leading-sm);
		font-weight: 600;
		color: var(--foreground);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
