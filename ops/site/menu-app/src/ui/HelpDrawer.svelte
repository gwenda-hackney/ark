<script lang="ts">
	/**
	 * Side drawer for page help. Portaled over the page. Escape and backdrop close.
	 */
	import { Icon } from "../shell";
	import Button from "./Button.svelte";
	import SidePanel from "./SidePanel.svelte";
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

<SidePanel {open} {onclose} ariaLabel={title} width="min(26rem, 100%)">
	<div class="help">
		<header class="head">
			<h2>{title}</h2>
			<Button
				variant="ghost"
				size="sm"
				type="button"
				aria-label="Close help"
				onclick={onclose}
			>
				{#snippet icon()}
					<Icon name="close" size={16} />
				{/snippet}
			</Button>
		</header>
		<div class="body scrollbar-fade">
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
		</div>
	</div>
</SidePanel>

<style>
	.help {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.85rem var(--card-pad) 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.head h2 {
		margin: 0;
		font-size: 1.05rem;
		letter-spacing: 0.02em;
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 0.85rem var(--card-pad) 1.25rem;
	}

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
