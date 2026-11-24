<script lang="ts">
	/** An email in the list: its name, and its subject quieter under it. */
	let { title = "", subtitle = "" }: { title?: string; subtitle?: string } = $props();
</script>

<div class="stack">
	<span class="title">{title}</span>
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

	.title,
	.sub {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		line-height: 1.3;
	}

	.title {
		font-weight: 500;
	}

	.sub {
		color: var(--fg-muted);
		font-size: var(--text-sm);
	}
</style>
