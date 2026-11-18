<script lang="ts">
	/**
	 * An editor over its list (events, a menu), the same everywhere:
	 *
	 * - it comes forward over the list when `open` turns on (editorZoom) and
	 *   shows a light placeholder until it has landed (EditorReveal);
	 * - phones get the back bar on top (EditorBackBar, with Help);
	 * - the editor is a card: its head (EditorCardHeader: kicker, title and
	 *   subtitle, tools, and the × that calls `onclose`), the tabs strip, a
	 *   body that scrolls inside the card, and the save bar at its foot
	 *   (EditorActionBar, given `actions`). A dirty editor's border warms.
	 * - Phones: the card goes edge to edge and all of it scrolls, title and
	 *   all, between the top bar and the Save bar, the tabs stuck on top.
	 *
	 * The head comes from its parts (`kicker`, `heading`, `subtitle`,
	 * `tools`), or whole from `header` when an editor has more to say there
	 * (events' EditorHeader, which is built on EditorCardHeader too).
	 * Keep it mounted and switch `open`, so the zoom plays both ways.
	 */
	import { untrack, type ComponentProps, type Snippet } from "svelte";
	import EditorActionBar from "./EditorActionBar.svelte";
	import EditorBackBar from "./EditorBackBar.svelte";
	import EditorCardHeader from "./EditorCardHeader.svelte";
	import EditorPlaceholder from "./EditorPlaceholder.svelte";
	import PageHelp from "./PageHelp.svelte";
	import { EditorReveal, editorZoom } from "./editor-zoom.svelte";

	let {
		open,
		form = false,
		onsubmit,
		busy = false,
		backLabel,
		onclose,
		dirty = false,
		help = true,
		header,
		kicker,
		heading = "",
		placeholder = false,
		subtitle = "",
		tools,
		tabs,
		actions,
		children,
		after,
		settled = $bindable(false),
	}: {
		/** Whether the editor shows. */
		open: boolean;
		/** The editor is a form: Enter submits it (`onsubmit`). */
		form?: boolean;
		onsubmit?: (event: SubmitEvent) => void;
		/** Working: said to assistive tech. */
		busy?: boolean;
		/** The phone back bar's label: the list it goes back to. */
		backLabel: string;
		/** Back, ×, and Esc where the editor wires it. */
		onclose: () => void;
		/** Unsaved changes. */
		dirty?: boolean;
		/** A Help button (the editor calls provideHelp). */
		help?: boolean;
		/** The whole head, for an editor with more than the parts below. */
		header?: Snippet;
		/** The kicker line: `<p class="eyebrow">Menu</p>` and any badges. */
		kicker?: Snippet;
		heading?: string;
		/** The heading is a stand-in ("New menu"): it shows muted. */
		placeholder?: boolean;
		subtitle?: string;
		/** Tools before Help and the ×. */
		tools?: Snippet;
		/** The tabs (a Segmented), when there are any. */
		tabs?: Snippet;
		/** The save bar's props. */
		actions: ComponentProps<typeof EditorActionBar>;
		/** The body, which scrolls inside the card. */
		children: Snippet;
		/** After the card, inside the editor: its dialogs. */
		after?: Snippet;
		/** Out: the editor has landed and its body is drawn (to focus a field). */
		settled?: boolean;
	} = $props();

	const reveal = new EditorReveal(untrack(() => open));
	$effect.pre(() => {
		settled = reveal.settled;
	});
</script>

{#snippet title()}
	<div class="name-line">
		<h1 class="title-text" class:placeholder>{heading}</h1>
	</div>
	{#if subtitle}<p class="sub">{subtitle}</p>{/if}
{/snippet}

{#snippet headTools()}
	{#if tools}{@render tools()}{/if}
	{#if help}<span class="desk-tool help-slot"><PageHelp /></span>{/if}
{/snippet}

{#snippet body()}
	{#if !reveal.settled}
		<EditorPlaceholder />
	{:else}
		<EditorBackBar label={backLabel} onback={onclose}>
			{#snippet tools()}{#if help}<PageHelp iconOnly />{/if}{/snippet}
		</EditorBackBar>
		<div class="split split--full">
			<div class="panel" class:dirty>
				{#if header}
					{@render header()}
				{:else if kicker}
					<EditorCardHeader {kicker} {title} tools={headTools} {onclose} {dirty} />
				{/if}
				{#if tabs}
					<div class="tabs">{@render tabs()}</div>
				{/if}
				<div class="tab-scroll scrollbar-fade">
					{@render children()}
				</div>
				<EditorActionBar {...actions} />
			</div>
		</div>
		{#if after}{@render after()}{/if}
	{/if}
{/snippet}

<!-- One element under the {#if}, so the zoom plays when `open` changes. -->
{#if open}
	<svelte:element
		this={form ? "form" : "div"}
		class="editor"
		novalidate={form || undefined}
		aria-busy={busy || undefined}
		transition:editorZoom
		onintroend={reveal.introend}
		onoutrostart={reveal.outrostart}
		onsubmit={form ? onsubmit : undefined}
	>
		{@render body()}
	</svelte:element>
{/if}

<style>
	.editor {
		position: absolute;
		inset: 0;
		z-index: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
		background: var(--ambient), var(--background);
	}

	.split {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas: "panel";
		column-gap: 0;
		row-gap: var(--space-4);
		flex: 1;
		min-height: 0;
		height: 100%;
		padding: var(--space-4) var(--page-gutter) var(--space-4);
	}

	.panel {
		grid-area: panel;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		height: 100%;
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		background: var(--panel-bg);
		box-shadow: var(--shadow-sm);
		overflow: hidden;
		transition: border-color var(--t-fast) var(--ease-in-out);
	}

	.panel.dirty {
		border-color: color-mix(in srgb, var(--destructive) 32%, var(--border));
	}

	.tabs {
		flex-shrink: 0;
		padding: var(--space-2) var(--card-pad-lg) 0;
		background: transparent;
		border-bottom: 1px solid var(--border);
	}

	/* Section cards sit on the page colour, so each group reads as one block. */
	.tab-scroll {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow: auto;
		overscroll-behavior: contain;
	}

	@media (max-width: 900px) {
		.split {
			padding: 0;
		}

		.panel {
			border-radius: 0;
			border-left: none;
			border-right: none;
		}

		.tabs {
			padding-left: max(var(--page-gutter), 1.125rem);
			padding-right: max(var(--page-gutter), 1.125rem);
		}
	}

	/* Phones: the whole editor scrolls, title and all, between the top bar and
	   the Save bar, instead of only the part under a pinned header. */
	@media (max-width: 900px) {
		.panel {
			overflow-x: hidden;
			overflow-y: auto;
			overscroll-behavior: contain;
		}

		.tab-scroll {
			flex: none;
			min-height: auto;
			overflow: visible;
		}

		/* Sticks under the top bar while the editor scrolls. */
		.tabs {
			position: sticky;
			top: 0;
			z-index: 3;
			/* The panel's own colour, solid, so fields don't show through. */
			background: linear-gradient(var(--panel-bg), var(--panel-bg)), var(--background);
		}
	}
</style>
