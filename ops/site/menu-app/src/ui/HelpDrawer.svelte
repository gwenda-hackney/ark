<script lang="ts">
	/**
	 * Side drawer for page help. Portaled over the page. Escape and backdrop close.
	 */
	import PageDrawer from "./PageDrawer.svelte";
	import type { PageHelpTopic } from "./types";

	let {
		open = false,
		onclose,
		title = "Help",
		topics = [],
	}: {
		open?: boolean;
		onclose: () => void;
		title?: string;
		topics?: PageHelpTopic[];
	} = $props();
</script>

<PageDrawer {open} {onclose} {title} closeLabel="Close help">
	{#if topics.length === 0}
		<p class="empty">No help for this page yet.</p>
	{:else}
		<dl class="topics">
			{#each topics as topic (topic.title)}
				<div class="topic">
					<dt>{topic.title}</dt>
					<dd>{topic.body}</dd>
				</div>
			{/each}
		</dl>
	{/if}
</PageDrawer>

<style>
	.topics {
		margin: 0;
		display: grid;
		gap: 1.1rem;
	}

	.topic dt {
		margin: 0 0 0.3rem;
		font-size: var(--text-sm);
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--foreground);
	}

	.topic dd {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--muted-foreground);
	}

	.empty {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}
</style>
