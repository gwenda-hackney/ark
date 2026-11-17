<script lang="ts">
	/**
	 * A full-width note at the top of a page or panel: an icon, a bold lead,
	 * then the rest in plain words. `info` for something worth knowing,
	 * `warning` for something switched off or about to bite (Featured artist
	 * is off, #313). Not for a request that failed (EmptyState tone="error")
	 * or passing news (a toast).
	 */
	import type { Snippet } from "svelte";
	import Icon from "../app/shell/Icon.svelte";

	let {
		tone = "info",
		icon = "",
		title = "",
		children,
	}: {
		tone?: "info" | "warning";
		/** Key into the shell icon map; by default an alert for a warning, else help. */
		icon?: string;
		/** The lead, in bold: what's going on, in a few words. */
		title?: string;
		children?: Snippet;
	} = $props();

	const glyph = $derived(icon || (tone === "warning" ? "alert" : "help"));
</script>

<div class="notice {tone}" role="note">
	<span class="icon" aria-hidden="true"><Icon name={glyph} size={18} /></span>
	<p class="body">
		{#if title}<strong class="title">{title}</strong>{/if}
		{#if children}{@render children()}{/if}
	</p>
</div>

<style>
	.notice {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		width: 100%;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		color: var(--foreground);
		font-size: var(--text-sm);
		line-height: 1.45;
	}

	.info {
		border-color: var(--info-border);
		background: var(--info-wash);
	}

	.warning {
		border-color: var(--warning-border);
		background: var(--warning-wash);
	}

	/* The icon sits on the first line of text. */
	.icon {
		display: inline-flex;
		flex-shrink: 0;
		margin-top: 0.0625rem;
	}

	.info .icon {
		color: var(--info);
	}

	.warning .icon {
		color: var(--warning);
	}

	.body {
		min-width: 0;
		margin: 0;
	}

	.title {
		margin-right: 0.25em;
		font-weight: 600;
	}
</style>
