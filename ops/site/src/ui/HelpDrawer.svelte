<script lang="ts">
	/**
	 * Side drawer for page help. Portaled over the page. Escape and backdrop close.
	 *
	 * Given `help` (an editor's HelpController), it follows that: opened from
	 * a field's "?", it shows that one topic with Show all help under it;
	 * Show all lists every topic and keeps the one you came from marked and in
	 * view. Without `help` it lists `topics` while `open`.
	 */
	import { tick } from "svelte";
	import { Icon } from "../app/shell";
	import Button from "./Button.svelte";
	import PageDrawer from "./PageDrawer.svelte";
	import type { HelpController } from "./help.svelte";
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
	const focus = $derived(help?.focus ?? null);
	const shown = $derived(focus ? allTopics.filter((t) => t.title === focus) : allTopics);

	/** The topic opened from a "?", still marked after Show all. */
	let marked = $state<string | null>(null);
	let listEl = $state<HTMLElement | undefined>();

	$effect(() => {
		if (!isOpen) marked = null;
		else if (focus) marked = focus;
	});

	function close() {
		if (help) help.close();
		else onclose();
	}

	async function showAll() {
		help?.showAll();
		await tick();
		// The button is gone now: keep focus, and the eye, on the topic.
		const el = listEl?.querySelector<HTMLElement>(".topic.marked");
		el?.focus({ preventScroll: true });
		el?.scrollIntoView({ block: "center" });
	}
</script>

<PageDrawer open={isOpen} onclose={close} title={drawerTitle} closeLabel="Close help">
	{#if allTopics.length === 0}
		<p class="empty">No help for this page yet.</p>
	{:else}
		<div bind:this={listEl}>
			<dl class="topics">
				{#each shown as topic (topic.title)}
					<div class="topic" class:marked={marked === topic.title} tabindex="-1">
						<dt>{topic.title}</dt>
						<dd>{topic.body}</dd>
					</div>
				{/each}
			</dl>
			{#if focus}
				<div class="show-all">
					<Button variant="secondary" size="sm" type="button" onclick={showAll}>
						{#snippet icon()}
							<Icon name="list" size={16} />
						{/snippet}
						Show all help
					</Button>
				</div>
			{/if}
		</div>
	{/if}
</PageDrawer>

<style>
	.topics {
		margin: 0;
		display: grid;
		gap: var(--space-4);
	}

	.topic {
		border-radius: var(--radius-md);
		scroll-margin-block: var(--space-4);
	}

	/* Focus lands here only from Show all; the mark already shows where. */
	.topic:focus {
		outline: none;
	}

	/* The topic you opened from a "?": a primary edge, kept after Show all. */
	.topic.marked {
		margin-inline: calc(-1 * var(--space-3));
		padding: var(--space-3);
		background: color-mix(in srgb, var(--primary) 8%, transparent);
		box-shadow: inset 3px 0 0 var(--primary);
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

	.show-all {
		margin-top: var(--space-5);
		padding-top: var(--space-4);
		border-top: 1px solid var(--border);
	}

	.empty {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}
</style>
