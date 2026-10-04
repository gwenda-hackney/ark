<script lang="ts">
	/**
	 * One dashboard card. Loads and fails on its own: a skeleton while its
	 * source loads, an error with Try again if it fails, and a single line
	 * when there is nothing to act on.
	 */
	import type { Snippet } from "svelte";
	import Icon from "../app/shell/Icon.svelte";

	let {
		id,
		title,
		state,
		error = "",
		clearText = "",
		clearIcon = "check",
		clearTone = "success",
		href = "",
		linkLabel = "",
		external = false,
		skeletonRows = 3,
		onretry,
		meta,
		children,
	}: {
		id: string;
		title: string;
		state: "loading" | "error" | "clear" | "ready";
		error?: string;
		/** The one line shown when there is nothing to do. */
		clearText?: string;
		clearIcon?: string;
		/** Muted for "nothing to show yet" (not set up), success for "all done". */
		clearTone?: "success" | "muted";
		href?: string;
		linkLabel?: string;
		external?: boolean;
		skeletonRows?: number;
		onretry?: () => void;
		/** Short summary beside the title: a count, a time. */
		meta?: Snippet;
		children?: Snippet;
	} = $props();
</script>

<section class="dash-card {id}" aria-labelledby="{id}-title" aria-busy={state === "loading"}>
	<header class="head">
		<h2 id="{id}-title">{title}</h2>
		{#if state === "ready" && meta}
			<div class="meta">{@render meta()}</div>
		{/if}
	</header>
	<div class="body" class:centred={state === "clear"}>
		{#if state === "loading"}
			<div class="skeleton" aria-hidden="true">
				{#each Array.from({ length: skeletonRows }) as _, index (index)}
					<span class="skel" style:width="{90 - index * 14}%"></span>
				{/each}
			</div>
			<span class="sr-only">Loading {title.toLowerCase()}…</span>
		{:else if state === "error"}
			<div class="failed" role="alert">
				<Icon name="alert" size={16} />
				<p>{error || "Could not load this."}</p>
				{#if onretry}
					<button type="button" class="retry" onclick={onretry}>Try again</button>
				{/if}
			</div>
		{:else if state === "clear"}
			<span class="ok-mark {clearTone}" aria-hidden="true"><Icon name={clearIcon} size={18} /></span>
			<p class="clear-text">{clearText}</p>
		{:else if children}
			{@render children()}
		{/if}
	</div>
	{#if href && (state === "ready" || state === "clear")}
		<footer class="foot">
			<a class="link" {href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
				{linkLabel || title}
				<Icon name={external ? "external-link" : "chevron-right"} size={14} />
			</a>
		</footer>
	{/if}
</section>

<style>
	.dash-card {
		display: flex;
		height: 100%;
		flex-direction: column;
		min-width: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--panel-bg);
	}

	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-5) 0;
		min-height: 3.25rem;
	}

	h2 {
		margin: 0;
		font-family: var(--font);
		font-size: var(--text-base);
		font-weight: 600;
		line-height: 1.5;
		color: var(--fg);
	}

	.meta {
		flex-shrink: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
		font-variant-numeric: tabular-nums;
		font-feature-settings: var(--font-features-num);
	}

	.body {
		flex: 1;
		padding: var(--space-3) var(--space-5) var(--space-4);
		min-width: 0;
	}

	/* Nothing to do: the card keeps its shape so the grid stays even. */
	.body.centred {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		min-height: 6rem;
		text-align: center;
	}

	.foot {
		padding: var(--space-2) var(--space-5);
		border-top: 1px solid var(--border);
	}

	.skeleton {
		display: grid;
		gap: var(--space-3);
		padding-block: var(--space-1);
	}

	.skeleton .skel {
		height: 0.875rem;
	}

	.failed {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
		color: var(--danger);
		font-size: var(--text-sm);
	}

	.failed p {
		margin: 0;
		flex: 1;
		min-width: 10rem;
	}

	.retry {
		min-height: var(--control-h);
		padding: 0 var(--space-3);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--fg);
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.retry:hover {
		background: var(--surface-3);
	}

	.ok-mark {
		display: inline-grid;
		place-items: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: var(--radius-pill);
		background: var(--success-wash);
		color: var(--success);
	}

	.ok-mark.muted {
		background: var(--surface-3);
		color: var(--fg-muted);
	}

	.clear-text {
		margin: 0;
		max-width: 22rem;
		font-size: var(--text-base);
		color: var(--fg-muted);
	}

	.link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: 2rem;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--fg-muted);
		text-decoration: none;
		white-space: nowrap;
	}

	.link:hover {
		color: var(--fg);
	}

	.link:focus-visible,
	.retry:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
		border-radius: var(--radius-sm);
	}

	@media (max-width: 900px) {
		.link,
		.retry {
			min-height: 44px;
		}
	}
</style>
