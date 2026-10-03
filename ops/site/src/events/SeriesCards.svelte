<script lang="ts">
	/**
	 * Series as cards, in weekday order. Each card is a real link to the
	 * series editor, so modifier clicks open a new tab.
	 */
	import { Badge } from "../ui";
	import { navigate } from "../app/nav";
	import type { SeriesCardRow } from "./series-card";

	let { rows }: { rows: SeriesCardRow[] } = $props();

	function open(event: MouseEvent, href: string) {
		if (event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		navigate(href);
	}

	/** Sanity can crop to the card; other hosts are left alone. */
	function photoSrc(url: string): string {
		if (!url.includes("cdn.sanity.io")) return url;
		return `${url.split("?")[0]}?w=640&h=400&fit=crop&auto=format`;
	}
</script>

<div class="scroll scrollbar-fade">
	<ul class="grid">
		{#each rows as row (row.id)}
			<li>
				<a class="card" href={row.href} onclick={(event) => open(event, row.href)}>
					<span class="media">
						{#if row.photo}
							<img src={photoSrc(row.photo)} alt="" loading="lazy" decoding="async" />
						{:else}
							<span class="blank" aria-hidden="true">{row.name.charAt(0).toUpperCase()}</span>
						{/if}
					</span>
					<span class="body">
						<span class="eyebrow">{row.when}</span>
						<span class="name">{row.name}</span>
						<span class="line">
							<span class="label">Next</span>
							<span class="value" class:none={row.next === "No nights"}>{row.next}</span>
						</span>
						<span class="line muted">{[row.cadence, row.time].filter(Boolean).join(" · ")}</span>
						<span class="foot">
							<Badge tone={row.tone} label={row.status} title={row.statusTitle} />
							{#if row.guest}<span class="guest">{row.guest}</span>{/if}
						</span>
					</span>
				</a>
			</li>
		{/each}
	</ul>
</div>

<style>
	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding-bottom: var(--space-6);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.card {
		display: flex;
		flex-direction: column;
		height: 100%;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface-1);
		color: inherit;
		text-decoration: none;
		overflow: hidden;
		transition:
			background-color var(--t-fast) var(--ease-in-out),
			border-color var(--t-fast) var(--ease-in-out);
	}

	.card:hover {
		background: var(--surface-3);
		border-color: var(--border-strong);
	}

	.card:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.media {
		display: block;
		aspect-ratio: 16 / 9;
		max-width: 100%;
		background: var(--surface-2);
		line-height: 0;
	}

	.media img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.blank {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		color: var(--fg-subtle);
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		line-height: 1;
	}

	.body {
		display: grid;
		gap: var(--space-1);
		padding: var(--space-3) var(--space-4) var(--space-4);
		min-width: 0;
	}

	.eyebrow {
		font-size: var(--text-2xs);
		line-height: var(--leading-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.name {
		font-size: var(--text-md);
		line-height: var(--leading-md);
		font-weight: 500;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.line {
		display: flex;
		gap: var(--space-2);
		align-items: baseline;
		min-width: 0;
		font-size: var(--text-sm);
		line-height: var(--leading-sm);
		color: var(--fg);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.line.muted {
		display: block;
		color: var(--fg-muted);
	}

	.value {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.label {
		flex-shrink: 0;
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--fg-subtle);
	}

	.none {
		color: var(--fg-muted);
	}

	.foot {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		margin-top: var(--space-2);
	}

	.guest {
		min-width: 0;
		font-size: var(--text-xs);
		color: var(--fg-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Phones: photo on the left, smaller type, so a week fits on a screen. */
	@media (max-width: 900px) {
		.grid {
			gap: var(--space-2);
		}

		.card {
			flex-direction: row;
			align-items: stretch;
		}

		.media {
			flex: 0 0 5.5rem;
			aspect-ratio: auto;
			min-height: 6.5rem;
		}

		.body {
			flex: 1;
			gap: 0.125rem;
			padding: var(--space-3);
		}

		.name {
			font-size: var(--text-base);
			line-height: var(--leading-base);
		}

		.foot {
			margin-top: var(--space-1);
		}
	}
</style>
