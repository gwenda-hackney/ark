<script lang="ts">
	/**
	 * Title block at the top of every page: big title, one supporting line, and
	 * the page's actions on the right. Identical spacing everywhere, so no page
	 * invents its own header again.
	 */
	import type { Snippet } from "svelte";

	let {
		title,
		subtitle,
		eyebrow,
		actions,
		children,
	}: {
		title: string;
		subtitle?: string;
		eyebrow?: string;
		actions?: Snippet;
		/** Extra row below the title — filters, chips, segmented controls. */
		children?: Snippet;
	} = $props();
</script>

<header class="page-header">
	<div class="top">
		<div class="titles">
			{#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
			<h1>{title}</h1>
			{#if subtitle}<p class="subtitle">{subtitle}</p>{/if}
		</div>
		{#if actions}
			<div class="actions">{@render actions()}</div>
		{/if}
	</div>
	{#if children}
		<div class="extra">{@render children()}</div>
	{/if}
</header>

<style>
	.page-header {
		display: grid;
		gap: var(--gap);
		margin-bottom: var(--gap-lg);
	}

	.top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--gap);
		flex-wrap: wrap;
	}

	.titles {
		display: grid;
		gap: 0.25rem;
		min-width: 0;
	}

	h1 {
		font-size: 1.5rem;
		letter-spacing: -0.028em;
	}

	.subtitle {
		max-width: 48rem;
		font-size: 0.8125rem;
		line-height: 1.55;
		color: var(--muted-foreground);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: var(--gap-xs);
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	.extra {
		display: flex;
		align-items: center;
		gap: var(--gap-sm);
		flex-wrap: wrap;
	}
</style>
