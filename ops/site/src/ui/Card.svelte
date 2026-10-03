<script lang="ts">
	/**
	 * The bento tile. Every panel in the app is one of these so radius, border,
	 * elevation and inner padding stay identical across pages.
	 *
	 * `flush` drops the body padding for panels that host a full-bleed table;
	 * the header keeps its own padding so the title never sits on the edge.
	 */
	import type { Snippet } from "svelte";

	let {
		title,
		subtitle,
		eyebrow,
		flush = false,
		fill = false,
		pad = "md",
		tone = "default",
		actions,
		header,
		footer,
		children,
		class: className = "",
	}: {
		title?: string;
		subtitle?: string;
		eyebrow?: string;
		flush?: boolean;
		/**
		 * Take the leftover height of a flex column and hand it to the body —
		 * how a data grid gets a size without a viewport calculation.
		 */
		fill?: boolean;
		pad?: "md" | "lg";
		tone?: "default" | "sunken" | "primary";
		actions?: Snippet;
		header?: Snippet;
		footer?: Snippet;
		children?: Snippet;
		class?: string;
	} = $props();

	const hasHead = $derived(Boolean(title || subtitle || eyebrow || actions || header));
</script>

<section class="card {tone} {className}" class:flush class:fill>
	{#if hasHead}
		<header class="head" class:lg={pad === "lg"}>
			{#if header}
				{@render header()}
			{:else}
				<div class="titles">
					{#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
					{#if title}<h2>{title}</h2>{/if}
					{#if subtitle}<p class="subtitle">{subtitle}</p>{/if}
				</div>
				{#if actions}
					<div class="actions">{@render actions()}</div>
				{/if}
			{/if}
		</header>
	{/if}

	{#if children}
		<div class="body" class:lg={pad === "lg"} class:fill>
			{@render children()}
		</div>
	{/if}

	{#if footer}
		<footer class="foot" class:lg={pad === "lg"}>
			{@render footer()}
		</footer>
	{/if}
</section>

<style>
	.card {
		display: flex;
		flex-direction: column;
		min-width: 0;
		border: 1px solid var(--border);
		/* Cards: 12px corners, a border and no shadow; shadows are for overlays. */
		border-radius: var(--radius-lg);
		background: var(--card);
		color: var(--card-foreground);
		transition: border-color var(--t) var(--ease-in-out);
	}

	.sunken {
		background: var(--sunken);
	}

	/* Grids and lists inside a card sit on its surface, never a darker box. */
	.card {
		--grid-bg: transparent;
		--grid-head-bg: transparent;
	}

	.primary {
		border-color: transparent;
		background:
			linear-gradient(
				145deg,
				var(--primary-wash-strong),
				var(--primary-wash) 55%,
				transparent
			),
			var(--card);
	}

	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--card-pad) var(--card-pad) 0;
	}

	.head.lg {
		padding: var(--card-pad-lg) var(--card-pad-lg) 0;
	}

	.titles {
		display: grid;
		gap: 0.125rem;
		min-width: 0;
	}

	h2 {
		margin: 0;
		font-size: var(--text-md);
		font-weight: 500;
		line-height: var(--leading-md);
	}

	.subtitle {
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--muted-foreground);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-shrink: 0;
	}

	.body {
		padding: var(--card-pad);
		min-width: 0;
	}

	.body.lg {
		padding: var(--card-pad-lg);
	}

	/* A header above a body collapses the doubled gap between them. */
	.head + .body {
		padding-top: var(--space-4);
	}

	.flush > .body {
		padding: 0;
	}

	.flush > .head + .body {
		padding-top: var(--space-4);
	}

	.card.fill {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.body.fill {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	/* Keep form content natural height; the body scrolls. */
	.body.fill > :global(*) {
		min-height: 0;
	}

	.foot {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-2);
		padding: var(--space-4) var(--card-pad) var(--card-pad);
		border-top: 1px solid var(--border);
		margin-top: auto;
	}

	.foot.lg {
		padding: var(--space-4) var(--card-pad-lg) var(--card-pad-lg);
	}
</style>
