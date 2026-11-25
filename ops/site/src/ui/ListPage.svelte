<script lang="ts">
	/**
	 * A list page: the page header (title, tabs, actions, toolbar) stays at the
	 * top and the body fills the rest of the pane. A table in the body fills it
	 * and scrolls inside itself, so its column header never scrolls away; cards
	 * or anything else taller than the pane scroll in the body, under the header.
	 * Every list page uses this, so they all behave the same (Events, Enquiries,
	 * Email, Occasions, Menus, Users).
	 *
	 * To fill: put the table (DataGrid, or a component wrapping one) in a
	 * `.list-fill` element, or give its own root that class. A small table
	 * inside an editor is the one exception: it stays as tall as its rows
	 * (DataGrid domLayout="autoHeight") because the editor scrolls as a whole.
	 *
	 * `parked`: an editor has come forward over the list; it steps back and
	 * dims, keeps its scroll, and can't be clicked.
	 */
	import type { Snippet } from "svelte";
	import PageHeader from "./PageHeader.svelte";
	import type { SegmentedItem } from "./types";

	let {
		title,
		subtitle,
		eyebrow,
		tabs,
		actions,
		toolbar,
		header,
		parked = false,
		class: className = "",
		children,
	}: {
		title: string;
		subtitle?: string;
		eyebrow?: string;
		tabs?: { items: readonly SegmentedItem[]; value: string; label?: string };
		actions?: Snippet;
		/** One row under the title: search, filters, count, view toggle. */
		toolbar?: Snippet;
		/** An extra row in the header, under the title. */
		header?: Snippet;
		parked?: boolean;
		class?: string;
		children?: Snippet;
	} = $props();
</script>

<div class="list-page {className}" class:parked inert={parked} aria-hidden={parked ? true : undefined}>
	<PageHeader {title} {subtitle} {eyebrow} {tabs} {actions} {toolbar} children={header} />
	<div class="list-body scrollbar-fade">
		{@render children?.()}
	</div>
</div>

<style>
	.list-page {
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		min-width: 0;
		overflow: hidden;
		padding: var(--page-gutter);
		transition:
			transform 440ms var(--ease),
			opacity 440ms var(--ease);
	}

	.list-page.parked {
		pointer-events: none;
		transform: scale(0.97);
		opacity: 0.35;
	}

	@media (prefers-reduced-motion: reduce) {
		.list-page {
			transition: none;
		}
	}

	.list-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		flex: 1;
		min-height: 0;
		min-width: 0;
		overflow: auto;
	}

	/* The table: fills what's left and scrolls inside, header pinned. */
	.list-body :global(.list-fill) {
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-height: 16rem;
		min-width: 0;
	}
</style>
