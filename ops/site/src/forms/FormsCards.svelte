<script lang="ts">
	/** Play applications as cards, for phones. Each card opens the application. */
	import type { FormSubmission } from "../app/api";
	import { Badge } from "../ui";
	import { navigate } from "../app/nav";
	import { formCard } from "./form-card";

	let { rows, showForm = false }: { rows: FormSubmission[]; showForm?: boolean } = $props();

	const cards = $derived(rows.map((row) => formCard(row, { showForm })));

	function open(event: MouseEvent, href: string) {
		if (event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		navigate(href);
	}
</script>

<ul class="cards scrollbar-fade">
	{#each cards as card (card.id)}
		<li>
			<a class="card" href={card.href} onclick={(event) => open(event, card.href)}>
				<span class="top">
					<span class="title">{card.title}</span>
					{#if card.submitted}<span class="when">{card.submitted}</span>{/if}
				</span>
				{#if card.email || card.form}
					<span class="sub">{[card.email, card.form].filter(Boolean).join(" · ")}</span>
				{/if}
				{#if card.badges.length}
					<span class="badges">
						{#each card.badges as badge (badge.label)}
							<Badge tone={badge.tone} label={badge.label} />
						{/each}
					</span>
				{/if}
			</a>
		</li>
	{/each}
</ul>

<style>
	.cards {
		display: grid;
		align-content: start;
		gap: var(--space-2);
		flex: 1;
		min-height: 0;
		margin: 0;
		padding: 0 0 var(--space-4);
		overflow-y: auto;
		list-style: none;
	}

	.card {
		display: grid;
		gap: var(--space-1);
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface-1);
		color: inherit;
		text-decoration: none;
	}

	.card:active {
		background: var(--surface-3);
	}

	.card:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		min-width: 0;
	}

	.title {
		min-width: 0;
		font-size: var(--text-base);
		line-height: var(--leading-base);
		font-weight: 500;
		color: var(--fg);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.when {
		flex-shrink: 0;
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}

	.sub {
		font-size: var(--text-sm);
		line-height: var(--leading-sm);
		color: var(--fg-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin-top: var(--space-1);
	}
</style>
