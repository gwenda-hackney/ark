<script lang="ts">
	let {
		primary = "",
		secondary = "",
	}: {
		primary?: string;
		secondary?: string;
	} = $props();
</script>

<span class="when">
	<span class="primary">{primary}</span>
	{#if secondary}<span class="secondary">{secondary}</span>{/if}
</span>

<style>
	.when {
		display: flex;
		flex-direction: column;
		gap: 0.08rem;
		min-width: 0;
		font-variant-numeric: tabular-nums;
	}

	.primary {
		color: var(--primary);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		line-height: 1.2;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.secondary {
		color: var(--muted-foreground);
		font-size: var(--text-xs);
		line-height: 1.2;
		text-transform: none;
		letter-spacing: 0;
		font-weight: 400;
	}
</style>
