<script lang="ts">
	/**
	 * Choosing what an Event card shows (#348): the nights to come, then the
	 * deals and pop-up kitchens, as What's on has them (GET /api/email/cards).
	 * One tap puts it in the email, drawn as the monthly email draws it.
	 */
	import { untrack } from "svelte";
	import { Button, Dialog, EmptyState, Skeleton } from "../ui";
	import { getEventCards, type EventCard, type EventCardChoice } from "./email-api";

	let { open, onclose, onpick }: { open: boolean; onclose: () => void; onpick: (card: EventCard) => void } = $props();

	let choices = $state<EventCardChoice[] | null>(null);
	let problem = $state("");

	async function load() {
		problem = "";
		try {
			choices = (await getEventCards()).choices;
		} catch (err) {
			problem = err instanceof Error ? err.message : "Couldn't load What's on.";
		}
	}
	$effect(() => {
		if (open && untrack(() => !choices && !problem)) void load();
	});

	const groups = $derived.by(() => {
		const out: { title: string; choices: EventCardChoice[] }[] = [];
		for (const choice of choices || []) {
			const group = out.find((one) => one.title === choice.group);
			if (group) group.choices.push(choice);
			else out.push({ title: choice.group, choices: [choice] });
		}
		return out;
	});
</script>

<Dialog {open} size="lg" title="Choose an event" {onclose}>
	<div class="chooser">
		{#if problem}
			<EmptyState tone="error" title="Couldn't load What's on" text={problem}>
				{#snippet action()}<Button variant="outline" size="sm" onclick={() => void load()}>Try again</Button>{/snippet}
			</EmptyState>
		{:else if !choices}
			<Skeleton rows={3} lines={1} label="Loading What's on…" />
		{:else if !choices.length}
			<p class="none">Nothing coming up on What's on. Add a night in Events first.</p>
		{:else}
			{#each groups as group (group.title)}
				<section aria-label={group.title}>
					<h3>{group.title}</h3>
					<div class="list">
						{#each group.choices as choice (choice.id)}
							<button type="button" class="pick" onclick={() => onpick(choice.card)}>
								<span class="name">{choice.label}</span>
								<span class="detail">{choice.detail}</span>
							</button>
						{/each}
					</div>
				</section>
			{/each}
		{/if}
	</div>
</Dialog>

<style>
	.chooser {
		display: grid;
		gap: var(--space-4);
		max-height: min(70vh, 44rem);
		overflow: auto;
	}
	h3 {
		margin: 0 0 var(--space-2);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.list {
		display: grid;
		gap: var(--space-2);
	}
	.pick {
		display: grid;
		gap: 0.1rem;
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--card);
		color: inherit;
		text-align: left;
		cursor: pointer;
	}
	.pick:hover,
	.pick:focus-visible {
		border-color: var(--primary);
	}
	.name {
		font-weight: 600;
	}
	.detail,
	.none {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}
</style>
