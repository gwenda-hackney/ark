<script lang="ts">
	import Badge from "../../ui/Badge.svelte";

	let { label = "", count }: { label?: string; count?: number } = $props();
</script>

<div class="week">
	<h2>{label}</h2>
	{#if count !== undefined}
		<Badge label={String(count)} title="{count} night{count === 1 ? '' : 's'}" />
	{/if}
</div>

<style>
	/* A group row: 13px/600 on the grid's surface-2 band, with a count. */
	.week {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		height: 100%;
		padding: 0 var(--space-3);
	}

	h2 {
		margin: 0;
		color: var(--fg);
		font-size: var(--text-sm);
		font-weight: 600;
		line-height: var(--leading-sm);
	}
</style>
