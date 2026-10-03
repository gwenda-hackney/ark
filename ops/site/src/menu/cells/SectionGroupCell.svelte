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
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
		line-height: 1.2;
	}

	.row {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		min-width: 0;
	}

	h3 {
		margin: 0;
		font-size: var(--text-base);
		font-weight: 600;
		letter-spacing: var(--tracking-2xl);
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
