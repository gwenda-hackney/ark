<script lang="ts">
	/**
	 * Menu items as cards, grouped by section. A card opens the drink exactly
	 * as the table's name does; modifier clicks keep the link's new-tab.
	 */
	import { Badge, HighlightText } from "../ui";
	import { hasRangeSelection } from "../ui/grid";
	import { menuItemPath } from "../app/nav";
	import { cardPhotoUrl, menuCard } from "./menu-card";
	import type { MenuListRow } from "./menu-list";
	import type { MenuItem } from "./types";

	let {
		rows,
		query = "",
		selectedId = null,
		onview,
	}: {
		/** Already sorted: group rows head the cards under them. */
		rows: MenuListRow[];
		query?: string;
		selectedId?: string | null;
		onview: (item: MenuItem) => void;
	} = $props();

	type Group = {
		id: string;
		title: string;
		subtitle?: string;
		count: number;
		items: Extract<MenuListRow, { _kind: "item" }>[];
	};

	const groups = $derived.by(() => {
		const out: Group[] = [];
		for (const row of rows) {
			if (row._kind === "group") {
				out.push({ id: row._id, title: row.title, subtitle: row.subtitle, count: row.count, items: [] });
			} else {
				out.at(-1)?.items.push(row);
			}
		}
		return out;
	});

	function open(event: MouseEvent, item: MenuItem) {
		if (hasRangeSelection()) {
			event.preventDefault();
			return;
		}
		if (event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		onview(item);
	}
</script>

<div class="cards-scroll scrollbar-fade">
	{#each groups as group (group.id)}
		<section class="group" aria-labelledby="cards-{group.id}">
			<header class="group-head">
				{#if group.subtitle}<p class="chapter">{group.subtitle}</p>{/if}
				<div class="group-row">
					<h3 id="cards-{group.id}">{group.title}</h3>
					<Badge label={String(group.count)} title="{group.count} item{group.count === 1 ? '' : 's'}" />
				</div>
			</header>
			<ul class="grid">
				{#each group.items as row (String(row._id || row.name || ""))}
					{@const card = menuCard(row)}
					<li>
						<a
							class="card"
							class:on={row._id === selectedId}
							href={row.name ? menuItemPath(row.name) : undefined}
							onclick={(event) => open(event, row)}
						>
							<span class="thumb">
								{#if card.photo}
									<img class="photo" src={cardPhotoUrl(card.photo)} alt="" loading="lazy" decoding="async" />
								{:else}
									<span class="swatch" aria-hidden="true">{card.swatch.initial}</span>
								{/if}
							</span>
							<span class="copy">
								<span class="top">
									<span class="title"><HighlightText text={card.title} {query} /></span>
									<span class="price num">{card.price}</span>
								</span>
								{#if row._matchHint}
									<span class="sub">
										<span class="hint-label">{row._matchHint.label}</span>
										<HighlightText text={row._matchHint.text} {query} />
									</span>
								{:else}
									<span class="sub">{[card.section, card.kind].filter(Boolean).join(" · ")}</span>
								{/if}
								<span class="foot">
									<span class="metric num {card.pour.tone}" title={card.pour.hint || undefined}>
										<span class="metric-label">Pour</span>
										{card.pour.label}
									</span>
									<span class="metric num">
										<span class="metric-label">Cost</span>
										{card.cost}
									</span>
									{#each card.badges as badge (badge.label)}
										<Badge tone={badge.tone} label={badge.label} title={badge.title} />
									{/each}
								</span>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>

<style>
	.cards-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 0 var(--page-gutter) var(--space-6);
	}

	.group + .group {
		margin-top: var(--space-6);
	}

	.group-head {
		position: sticky;
		top: 0;
		z-index: 1;
		display: grid;
		gap: 0.1rem;
		padding: var(--space-2) 0;
		margin-bottom: var(--space-3);
		/* Same viewport-pinned glow as the page, so it hides cards scrolling
		   under it without showing as a band. */
		background: var(--ambient), var(--background);
		border-bottom: 1px solid var(--border);
	}

	.chapter {
		margin: 0;
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.group-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}

	h3 {
		margin: 0;
		font-size: var(--text-sm);
		line-height: var(--leading-sm);
		font-weight: 600;
		color: var(--fg);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Desktop: the photo leads, full width at 4:3, details under it. */
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr));
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.card {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--panel-bg);
		color: inherit;
		text-decoration: none;
		transition:
			background-color var(--t-fast) var(--ease-in-out),
			border-color var(--t-fast) var(--ease-in-out);
	}

	.card:hover {
		background: var(--surface-2);
		border-color: var(--border-strong);
	}

	.card:hover .photo {
		transform: scale(1.03);
	}

	.card.on {
		border-color: var(--primary-border, var(--primary));
		box-shadow: 0 0 0 1px var(--primary-border, var(--primary));
	}

	.card:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.thumb {
		position: relative;
		display: block;
		aspect-ratio: 4 / 3;
		max-width: 100%;
		overflow: hidden;
		background: var(--surface-2);
		line-height: 0;
	}

	.photo {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 300ms var(--ease);
	}

	.swatch {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		background:
			radial-gradient(circle at 50% 40%, var(--surface-3), var(--surface-2) 70%);
		color: var(--fg-subtle);
		font-family: var(--font-display);
		font-size: 3.5rem;
		font-weight: 600;
		line-height: 1;
	}

	.copy {
		display: grid;
		align-content: start;
		gap: var(--space-1);
		flex: 1;
		min-width: 0;
		padding: var(--space-3) var(--space-4) var(--space-4);
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
		font-size: var(--text-md);
		line-height: var(--leading-md);
		font-weight: 500;
		color: var(--fg);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.price {
		flex-shrink: 0;
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--fg);
	}

	.sub {
		font-size: var(--text-sm);
		line-height: var(--leading-sm);
		color: var(--fg-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.hint-label {
		margin-right: 0.4em;
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--fg-subtle);
	}

	.foot {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-3);
		margin-top: var(--space-1);
	}

	.metric {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-1);
		font-size: var(--text-sm);
		color: var(--fg);
	}

	.metric-label {
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--fg-subtle);
	}

	.metric.success {
		color: var(--success);
	}

	.metric.warning {
		color: var(--warning);
	}

	.metric.danger {
		color: var(--danger);
	}

	@media (prefers-reduced-motion: reduce) {
		.photo {
			transition: none;
		}

		.card:hover .photo {
			transform: none;
		}
	}

	/* Phones: a row per drink with a square photo, smaller type, so the list scans. */
	@media (max-width: 900px) {
		.group + .group {
			margin-top: var(--space-4);
		}

		.grid {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--space-2);
		}

		.card {
			flex-direction: row;
			align-items: stretch;
		}

		.thumb {
			flex: 0 0 5.5rem;
			aspect-ratio: auto;
			min-height: 5.5rem;
		}

		.swatch {
			font-size: var(--text-xl);
		}

		.copy {
			padding: var(--space-3);
		}

		.title,
		.price {
			font-size: var(--text-base);
			line-height: var(--leading-base);
		}
	}
</style>
