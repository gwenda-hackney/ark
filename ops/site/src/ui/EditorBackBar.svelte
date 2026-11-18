<script lang="ts">
	/**
	 * Phone-only editor chrome: a labeled back control at the top of the
	 * overlay, in the place a list push would put it. Hidden on desktop.
	 *
	 * The same on every editor: Back on the left; on the right the website
	 * pill (saving, waiting, stuck) and `tools`, which is Help and nothing
	 * else. Save, Delete and the header's other tools live in the bottom bar
	 * (EditorActionBar), so the top stays clear for the title.
	 */
	import type { Snippet } from "svelte";
	import { Icon } from "../app/shell";
	import WebsiteJobsTray from "../app/shell/WebsiteJobsTray.svelte";

	let {
		label,
		dirty = false,
		onback,
		tools,
	}: {
		label: string;
		/** Only for a page without the pill's unsaved mark; editors leave it off. */
		dirty?: boolean;
		onback: () => void;
		/** Icon buttons on the right: the editor's Help. */
		tools?: Snippet;
	} = $props();
</script>

<header class="bar editor-back-bar">
	<button type="button" class="back" onclick={onback}>
		<Icon name="chevron-left" size={22} strokeWidth={1.8} />
		<span>{label}</span>
	</button>
	<div class="end">
		{#if dirty}
			<span class="unsaved" aria-live="polite">Unsaved</span>
		{/if}
		<WebsiteJobsTray />
		{#if tools}{@render tools()}{/if}
	</div>
</header>

<style>
	.bar {
		display: none;
	}

	/* Keep in sync with SHELL_MOBILE_MAX_PX. */
	@media (max-width: 900px) {
		.bar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--space-3);
			flex-shrink: 0;
			min-height: 2.75rem;
			padding: max(0.2rem, env(safe-area-inset-top, 0px)) var(--page-gutter)
				0.2rem;
			border-bottom: 1px solid var(--border);
			background: var(--ambient), var(--background);
			z-index: 4;
		}

		.back {
			display: inline-flex;
			align-items: center;
			gap: 0.1rem;
			min-width: 0;
			min-height: 2.75rem;
			margin: 0 0 0 -0.55rem;
			padding: 0 0.55rem;
			border: 0;
			border-radius: var(--radius-md);
			background: none;
			color: var(--primary);
			font: inherit;
			font-size: var(--text-md);
			font-weight: 500;
			letter-spacing: var(--tracking-lg);
			cursor: pointer;
		}

		.back span {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.back:focus-visible {
			outline: 2px solid var(--ring);
			outline-offset: 2px;
		}

		.end {
			display: flex;
			align-items: center;
			flex-shrink: 0;
			gap: var(--space-2);
		}

		/* Help's glyph, not its tap area, lines up with the page's right edge. */
		.end > :global(.btn:last-child) {
			margin-right: -0.75rem;
		}

		.end:empty {
			display: none;
		}

		/* Thumb-sized icon buttons (Help). */
		.end :global(.btn) {
			width: 2.75rem;
			height: 2.75rem;
			color: var(--muted-foreground);
		}

		.end :global(.btn .glyph) {
			width: 1.25rem;
			height: 1.25rem;
		}

		.unsaved {
			flex-shrink: 0;
			font-size: var(--text-sm);
			font-weight: 600;
			color: var(--destructive);
		}
	}
</style>
