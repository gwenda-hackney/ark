<script lang="ts">
	/**
	 * Side drawer for page help. Portaled over the page. Escape and backdrop close.
	 *
	 * A search box on top filters the topics by title and text, or by title
	 * alone with `field:Name`. Given `help` (an editor's HelpController), it
	 * follows that: a field's "?" opens it with `field:<topic>` in the box,
	 * and clearing the box shows every topic. Without `help` it lists `topics` while `open`.
	 */
	import PageDrawer from "./PageDrawer.svelte";
	import SearchField from "./SearchField.svelte";
	import { filterHelp, type HelpController } from "./help.svelte";
	import type { PageHelpTopic } from "./types";

	let {
		help,
		open = false,
		onclose = () => undefined,
		title = "Help",
		topics = [],
	}: {
		help?: HelpController;
		open?: boolean;
		onclose?: () => void;
		title?: string;
		topics?: PageHelpTopic[];
	} = $props();

	const isOpen = $derived(help ? help.open : open);
	const allTopics = $derived(help ? help.topics : topics);
	const drawerTitle = $derived(help ? help.title : title);

	/** The search box without a controller; starts empty on every open. */
	let localQuery = $state("");
	$effect(() => {
		if (!help && !open) localQuery = "";
	});
	const query = $derived(help ? help.query : localQuery);
	const shown = $derived(filterHelp(allTopics, query));

	function setQuery(next: string) {
		if (help) help.query = next;
		else localQuery = next;
	}

	function close() {
		if (help) help.close();
		else onclose();
	}
</script>

<PageDrawer open={isOpen} onclose={close} title={drawerTitle} closeLabel="Close help">
	{#if allTopics.length === 0}
		<p class="empty">No help for this page yet.</p>
	{:else}
		<div class="search">
			<SearchField
				bind:value={() => query, setQuery}
				placeholder="Search help, or field:name"
				ariaLabel="Search help"
				count={shown.length}
				width="100%"
			/>
		</div>
		{#if shown.length === 0}
			<p class="empty">No help matches “{query.trim()}”.</p>
		{:else}
			<dl class="topics">
				{#each shown as topic (topic.title)}
					<div class="topic">
						<dt>{topic.title}</dt>
						<dd>{topic.body}</dd>
					</div>
				{/each}
			</dl>
		{/if}
	{/if}
</PageDrawer>

<style>
	.topics {
		margin: 0;
		display: grid;
		gap: var(--space-4);
	}

	.topic dt {
		margin: 0 0 var(--space-1);
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--foreground);
	}

	.topic dd {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--muted-foreground);
	}

	/* Stays on top while the topics scroll under it. */
	.search {
		position: sticky;
		top: -0.85rem;
		z-index: 1;
		margin: -0.85rem calc(-1 * var(--card-pad)) var(--space-4);
		padding: 0.85rem var(--card-pad) var(--space-3);
		background: var(--panel-bg);
		backdrop-filter: blur(16px);
	}

	.empty {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}
</style>
