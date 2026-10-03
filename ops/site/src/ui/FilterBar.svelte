<script lang="ts">
	/**
	 * Search and filters for a list page, one component for every list so the
	 * two layouts stay in step (#31).
	 *
	 * Desktop: one row. Search, the page's filters inline, Clear, then `end`
	 * (a count, a view toggle) on the right.
	 * Phone: search and a "Filters" button with the number that are on. The
	 * button opens a bottom sheet with the same filters; what is applied shows
	 * as removable chips under the row.
	 *
	 * Wrap each filter in FilterField so its label works in both layouts.
	 */
	import type { Snippet } from "svelte";
	import Icon from "../app/shell/Icon.svelte";
	import Button from "./Button.svelte";
	import Chip from "./Chip.svelte";
	import SearchField from "./SearchField.svelte";
	import type { FilterChip } from "./filters";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "./viewport.svelte";

	let {
		query = $bindable(""),
		placeholder = "Search…",
		ariaLabel = "Search",
		searchCount,
		searchWidth = "18rem",
		active = 0,
		chips = [],
		onclearfilters,
		filters,
		end,
		endOnPhone = false,
		sheetTitle = "Filters",
	}: {
		query?: string;
		placeholder?: string;
		ariaLabel?: string;
		/** Matches for the current search, shown in the field. */
		searchCount?: number;
		searchWidth?: string;
		/** How many filters (not the search) are on. */
		active?: number;
		/** Applied filters as chips under the phone row. */
		chips?: FilterChip[];
		/** Turn every filter off (the search stays). */
		onclearfilters?: () => void;
		filters?: Snippet;
		end?: Snippet;
		/** Also show `end` in the phone row. Off by default: the row is tight. */
		endOnPhone?: boolean;
		sheetTitle?: string;
	} = $props();

	const phone = mediaMatches(SHELL_MOBILE_QUERY);
	let sheet = $state<HTMLDialogElement | null>(null);
	let sheetOpen = $state(false);
	const sheetId = $props.id();

	const canClear = $derived(Boolean(query.trim()) || active > 0);

	function clearAll() {
		query = "";
		onclearfilters?.();
	}

	function openSheet() {
		sheet?.showModal();
		sheetOpen = true;
	}

	function closeSheet() {
		sheet?.close();
	}

	/** A click on the dimmed area outside the panel closes the sheet. */
	function onSheetClick(event: MouseEvent) {
		if (event.target === sheet) closeSheet();
	}

	// Leaving phone width with the sheet open: close it, the filters are inline now.
	$effect(() => {
		if (!phone.matches && sheetOpen) closeSheet();
	});
</script>

<div class="filter-bar" class:phone={phone.matches}>
	<div class="row">
		<div class="search">
			<SearchField
				bind:value={query}
				{placeholder}
				{ariaLabel}
				count={searchCount}
				width={phone.matches ? "100%" : searchWidth}
			/>
		</div>
		{#if filters && !phone.matches}
			<div class="inline-filters">{@render filters()}</div>
		{/if}
		{#if filters && phone.matches}
			<Button
				variant="outline"
				class="filters-btn"
				aria-haspopup="dialog"
				aria-controls={sheetId}
				aria-expanded={sheetOpen}
				onclick={openSheet}
			>
				{#snippet icon()}<Icon name="filter" size={16} />{/snippet}
				Filters{#if active}<span class="count num pill-text">{active}</span>{/if}
			</Button>
		{/if}
		{#if !phone.matches && (filters || onclearfilters) && canClear}
			<Button variant="ghost" size="sm" onclick={clearAll}>Clear</Button>
		{/if}
		{#if end && (!phone.matches || endOnPhone)}
			<div class="end">{@render end()}</div>
		{/if}
	</div>

	{#if phone.matches && chips.length}
		<ul class="chips" aria-label="Filters on">
			{#each chips as chip (chip.key)}
				<li>
					<Chip onremove={chip.onremove} removeLabel="Remove {chip.label}">{chip.label}</Chip>
				</li>
			{/each}
		</ul>
	{/if}
</div>

{#if filters}
	<dialog
		bind:this={sheet}
		id={sheetId}
		class="sheet"
		aria-labelledby="{sheetId}-title"
		onclose={() => (sheetOpen = false)}
		onclick={onSheetClick}
	>
		<div class="panel">
			<header class="sheet-head">
				<h2 id="{sheetId}-title">{sheetTitle}</h2>
				<button type="button" class="close" aria-label="Close" onclick={closeSheet}>
					<Icon name="close" size={18} />
				</button>
			</header>
			<div class="sheet-body filter-sheet scrollbar-fade">
				{#if sheetOpen}{@render filters()}{/if}
			</div>
			<footer class="sheet-foot">
				<Button variant="ghost" disabled={!active} onclick={() => onclearfilters?.()}>Clear all</Button>
				<Button variant="primary" onclick={closeSheet}>Show results</Button>
			</footer>
		</div>
	</dialog>
{/if}

<style>
	.filter-bar {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}

	.row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-3);
		min-width: 0;
	}

	.search {
		flex: 0 1 auto;
		min-width: 12rem;
	}

	.inline-filters {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
		min-width: 0;
	}

	.end {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-left: auto;
	}

	.end :global(.meta) {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
		white-space: nowrap;
	}

	.phone .row {
		flex-wrap: nowrap;
		gap: var(--space-2);
	}

	.phone .search {
		flex: 1 1 auto;
		min-width: 0;
	}

	.count {
		display: inline-grid;
		place-items: center;
		min-width: 1.25rem;
		height: 1.25rem;
		margin-left: var(--space-2);
		padding: 0 var(--space-1);
		border-radius: var(--radius-pill);
		background: var(--primary);
		color: var(--primary-foreground);
		font-size: var(--text-2xs);
		font-weight: 600;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* ─── Sheet ─── */

	.sheet {
		position: fixed;
		inset: auto 0 0 0;
		width: 100%;
		max-width: 100%;
		max-height: min(85dvh, 40rem);
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--fg);
		overflow: visible;
	}

	.sheet::backdrop {
		background: rgb(0 0 0 / 0.55);
	}

	.sheet[open] .panel {
		animation: sheet-up var(--t-slow) var(--ease) both;
	}

	@keyframes sheet-up {
		from {
			transform: translateY(100%);
		}
		to {
			transform: none;
		}
	}

	.panel {
		display: flex;
		flex-direction: column;
		max-height: min(85dvh, 40rem);
		border: 1px solid var(--border);
		border-bottom: 0;
		border-radius: var(--radius-xl) var(--radius-xl) 0 0;
		background: var(--surface-2);
		box-shadow: var(--shadow-pop);
	}

	.sheet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-2) var(--space-2) var(--space-5);
	}

	.sheet-head h2 {
		font-size: var(--text-md);
		line-height: var(--leading-md);
		font-weight: 600;
		letter-spacing: 0;
	}

	.close {
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		border: 0;
		border-radius: var(--radius-md);
		background: none;
		color: var(--fg-muted);
	}

	.close:hover {
		background: var(--surface-3);
		color: var(--fg);
	}

	.sheet-body {
		display: grid;
		gap: var(--space-5);
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--space-2) var(--space-5) var(--space-5);
	}

	.sheet-foot {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-5) calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
		border-top: 1px solid var(--border);
	}

	.sheet-foot :global(.btn) {
		flex: 1;
	}
</style>
