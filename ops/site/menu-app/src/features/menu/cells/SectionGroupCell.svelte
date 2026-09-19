<script lang="ts">
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
		<span class="count">{count} item{count === 1 ? "" : "s"}</span>
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
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--primary);
		line-height: 1.2;
	}

	.row {
		display: flex;
		align-items: baseline;
		gap: 0.65rem;
		min-width: 0;
	}

	h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 600;
		letter-spacing: -0.02em;
		color: var(--foreground);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.count {
		flex-shrink: 0;
		font-size: var(--text-xs);
		color: var(--muted-foreground);
	}
</style>
