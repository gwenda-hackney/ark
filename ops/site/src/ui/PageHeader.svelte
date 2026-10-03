<script lang="ts">
	/**
	 * Title block at the top of every page: big title, one supporting line, and
	 * the page's actions on the right. Identical spacing everywhere, so no page
	 * invents its own header again.
	 *
	 * Phones get a compact header: when the shell's tab strip already names the
	 * page (`.title-in-strip`), the title is kept for screen readers only. The
	 * subtitle is one line and the actions stay on one row. Give Help and
	 * Refresh buttons `data-compact` and they shrink to their icon on phones.
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
		gap: var(--space-4);
		margin-bottom: var(--space-6);
	}

	.top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
	}

	.titles {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}

	/* Page titles keep the brand serif; everything else is Inter. */
	h1 {
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		line-height: var(--leading-2xl);
		letter-spacing: var(--tracking-2xl);
	}

	.subtitle {
		max-width: 48rem;
		font-size: var(--text-base);
		line-height: var(--leading-base);
		color: var(--muted-foreground);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	.extra {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	/* Keep in sync with SHELL_MOBILE_MAX_PX. */
	@media (max-width: 900px) {
		.page-header {
			gap: var(--space-3);
			margin-bottom: var(--space-4);
		}

		.top {
			flex-direction: column;
			align-items: stretch;
			flex-wrap: nowrap;
			gap: var(--space-3);
		}

		.subtitle {
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
			font-size: var(--text-sm);
			line-height: var(--leading-sm);
		}

		/* The strip shows the page name; keep the heading for screen readers. */
		:global(.title-in-strip) h1 {
			position: absolute;
			width: 1px;
			height: 1px;
			margin: -1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}

		:global(.title-in-strip) .titles:not(:has(.eyebrow, .subtitle)) {
			display: contents;
		}

		/* One row: scroll sideways rather than wrap into a ragged second line. */
		.actions {
			flex-wrap: nowrap;
			justify-content: flex-start;
			gap: var(--space-1);
			margin: -2px;
			padding: 2px;
			overflow-x: auto;
			scrollbar-width: none;
		}

		.actions::-webkit-scrollbar {
			display: none;
		}

		.actions :global(.btn[data-compact]) {
			width: var(--control-h);
			height: var(--control-h);
			padding: 0;
		}

		.actions :global(.btn[data-compact] .label) {
			position: absolute;
			width: 1px;
			height: 1px;
			margin: -1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
	}
</style>
