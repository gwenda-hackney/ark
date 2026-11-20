<script lang="ts">
	/**
	 * The head of an editor card (EditorShell): a kicker line (what it is, and
	 * where it stands) with the tools on the right, then the title, and the
	 * editor's own notes under them. Tools marked `desk-tool`, and the
	 * close button (`close-btn`), are desktop only: on phones Help is in the
	 * top bar (EditorBackBar) and the rest in the Save bar's ⋯.
	 */
	import type { Snippet } from "svelte";
	import { Icon } from "../app/shell";
	import Button from "./Button.svelte";

	let {
		kicker,
		tools,
		title,
		meta,
		notes,
		onclose,
		dirty = false,
		compact = false,
	}: {
		/** The kicker line: an eyebrow (`.eyebrow`, e.g. "Menu") and any status badges. */
		kicker: Snippet;
		/** Buttons on the right, before the ×: Help, Reload. */
		tools?: Snippet;
		/** The title block, under the kicker (`.name-line` > `.title-text`, `.sub`). */
		title: Snippet;
		/** Beside the title on the right, e.g. a night's date. */
		meta?: Snippet;
		/** Lines across the foot of the head (grid row 3 and on). */
		notes?: Snippet;
		/** The × at the end of the tools (desktop; phones close with Back). */
		onclose?: () => void;
		/** Unsaved changes: the × says so. */
		dirty?: boolean;
		/** A tight head, for an editor that needs the room below (the email editor): a smaller title and line under it. */
		compact?: boolean;
	} = $props();
</script>

<header class="panel-head" class:compact>
	<!-- One wrapping row: when the buttons don't fit beside the status, they
	     drop to their own line instead of overlapping it (#43). -->
	<div class="head-row">
		<div class="type-line">{@render kicker()}</div>
		{#if tools || onclose}
			<div class="head-tools">
				<div class="toolbar-actions">
					{#if tools}{@render tools()}{/if}
					{#if onclose}
						<Button
							class="close-btn"
							variant="ghost"
							size="sm"
							type="button"
							aria-label={dirty ? "Close with unsaved changes" : "Close"}
							title={dirty ? "Close (unsaved)" : "Close"}
							onclick={onclose}
						>
							{#snippet icon()}
								<Icon name="close" size={14} />
							{/snippet}
						</Button>
					{/if}
				</div>
			</div>
		{/if}
	</div>
	<div class="title-name">{@render title()}</div>
	{#if meta}
		<div class="title-meta">{@render meta()}</div>
	{/if}
	{#if notes}{@render notes()}{/if}
</header>

<style>
	.panel-head {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: start;
		column-gap: var(--space-3);
		row-gap: 0.2rem;
		flex-shrink: 0;
		padding: 0.55rem var(--card-pad-lg) 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.panel-head.compact {
		padding: 0.35rem var(--card-pad-lg) 0.45rem;
		row-gap: 0;
	}
	.panel-head.compact .title-name :global(.title-text) {
		font-size: var(--text-xl);
		line-height: 1.2;
	}
	.panel-head.compact .title-name :global(.sub) {
		font-size: var(--text-xs);
	}

	.head-row {
		grid-column: 1 / -1;
		grid-row: 1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-1) var(--space-3);
		min-width: 0;
	}

	.type-line {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		max-width: 100%;
		min-height: var(--control-h-sm);
	}

	.type-line :global(.eyebrow) {
		min-width: 0;
		margin: 0;
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.head-tools {
		display: flex;
		align-items: center;
		margin-left: auto;
		max-width: 100%;
	}

	.toolbar-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-1);
		min-height: var(--control-h-sm);
	}

	.head-tools :global(.close-btn) {
		color: var(--muted-foreground);
	}

	.head-tools :global(.help-slot) {
		display: contents;
	}

	.head-tools :global(.close-btn:hover:not(:disabled)) {
		color: var(--destructive);
		background: var(--destructive-wash);
	}

	.title-name {
		grid-column: 1;
		grid-row: 2;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.15rem;
		min-width: 0;
	}

	.title-name :global(.name-line) {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-3);
		min-width: 0;
	}

	.title-name :global(.title-text) {
		margin: 0;
		min-width: 0;
		color: var(--foreground);
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		font-weight: 600;
		letter-spacing: var(--tracking-2xl);
		line-height: 1.3;
		overflow-wrap: anywhere;
	}

	.title-name :global(.title-text.placeholder) {
		color: var(--muted-foreground);
	}

	.title-name :global(.sub) {
		margin: 0;
		font-size: var(--text-base);
		color: var(--muted-foreground);
	}

	.title-meta {
		grid-column: 2;
		grid-row: 2;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		justify-self: stretch;
		gap: 0.08rem;
		padding-top: 0.12rem;
		min-width: 0;
	}

	@media (max-width: 900px) {
		/* Phones: Help is in the top bar; the other desk tools are in the
		   bottom bar's ⋯, so there is one toolbar. */
		.head-tools :global(.close-btn),
		.head-tools :global(.photo-expand),
		.head-tools :global(.desk-tool) {
			display: none;
		}

		/* What stays (Update website) sits beside the status, which wraps onto two lines first. */
		.head-row {
			flex-wrap: nowrap;
		}

		.type-line {
			flex: 1 1 auto;
			flex-wrap: wrap;
			row-gap: var(--space-1);
		}

		.head-tools {
			flex: none;
		}

		.panel-head {
			padding-left: max(var(--page-gutter), 1.125rem);
			padding-right: max(var(--page-gutter), 1.125rem);
		}
	}

	@media (max-width: 600px) {
		.title-name :global(.title-text) {
			font-size: var(--text-xl);
			letter-spacing: var(--tracking-xl);
		}
	}
</style>
