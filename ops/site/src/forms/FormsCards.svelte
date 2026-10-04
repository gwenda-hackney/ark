<script lang="ts">
	/** Play applications as cards: one column on phones, a grid at a desk. Each card opens the application. */
	import type { FormSubmission } from "../app/api";
	import { Badge } from "../ui";
	import { navigate } from "../app/nav";
	import { formCard } from "./form-card";

	let { rows, showForm = false }: { rows: FormSubmission[]; showForm?: boolean } = $props();

	const cards = $derived(rows.map((row) => formCard(row, { showForm })));

	function initial(title: string): string {
		return title.trim().charAt(0).toUpperCase() || "?";
	}

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
				<span class="head">
					<span class="avatar" aria-hidden="true">{initial(card.title)}</span>
					<span class="who">
						<span class="top">
							<span class="title">{card.title}</span>
							{#if card.submitted}<span class="when">{card.submitted}</span>{/if}
						</span>
						{#if card.email || card.form}
							<span class="sub">{[card.email, card.form].filter(Boolean).join(" · ")}</span>
						{/if}
					</span>
				</span>
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
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
		align-content: start;
		gap: var(--space-3);
		flex: 1;
		min-height: 0;
		margin: 0;
		padding: 0 0 var(--space-4);
		overflow-y: auto;
		list-style: none;
	}

	.card {
		display: grid;
		align-content: start;
		gap: var(--space-2);
		height: 100%;
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--panel-bg);
		color: inherit;
		text-decoration: none;
	}

	.card:hover {
		border-color: var(--border-strong);
		background: var(--surface-2);
	}

	.card:active {
		background: var(--surface-3);
	}

	.head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
	}

	.avatar {
		display: inline-grid;
		place-items: center;
		flex-shrink: 0;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 50%;
		background: var(--surface-3);
		color: var(--fg-muted);
		font-size: var(--text-base);
		font-weight: 600;
	}

	.who {
		display: grid;
		flex: 1;
		min-width: 0;
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
		padding-left: calc(2.5rem + var(--space-3));
	}

	@media (max-width: 900px) {
		.cards {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--space-2);
		}

		.card {
			padding: var(--space-3);
		}
	}
</style>
