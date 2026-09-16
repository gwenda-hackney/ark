<script lang="ts">
	import { NativeSelect } from "../../ui";
	import HighlightText from "../../ui/HighlightText.svelte";
	import type { MenuItem } from "../../lib/types";
	import {
		sortMenuListRows,
		type MenuListRow,
	} from "../../lib/menu-list";
	import PhotoCell from "./cells/PhotoCell.svelte";
	import PublishStatusCell from "./cells/PublishStatusCell.svelte";

	let {
		rows,
		query = "",
		selectedId = null,
		onview,
	}: {
		rows: MenuListRow[];
		query?: string;
		selectedId?: string | null;
		onview: (item: MenuItem) => void;
	} = $props();

	let sort = $state("section");

	const shown = $derived(
		sortMenuListRows(rows, sort === "price" || sort === "pour" ? sort : "section"),
	);
</script>

<div class="list">
	<div class="sort">
		<label class="sort-label" for="menu-list-sort">Sort</label>
		<NativeSelect
			id="menu-list-sort"
			size="sm"
			bind:value={sort}
			options={[
				{ value: "section", label: "Menu order" },
				{ value: "pour", label: "Pour cost" },
				{ value: "price", label: "Price" },
			]}
		/>
	</div>
	<div class="rows scrollbar-fade">
		{#each shown as row (row._kind === "group" ? row._id : String(row._id || row.name || ""))}
			{#if row._kind === "group"}
				<div class="group">
					{#if row.subtitle}
						<p class="chapter">{row.subtitle}</p>
					{/if}
					<div class="group-row">
						<h3>{row.title}</h3>
						<span class="count">{row.count} item{row.count === 1 ? "" : "s"}</span>
					</div>
				</div>
			{:else}
				<button
					type="button"
					class="item"
					class:on={row._id === selectedId}
					onclick={() => onview(row)}
				>
					<PhotoCell
						size="md"
						url={row.image?.asset?.url || ""}
						alt={row.name || ""}
					/>
					<span class="copy">
						<span class="name">
							<HighlightText text={row.name || "Untitled"} {query} />
						</span>
						{#if row._matchHint}
							<span class="hint">
								<span class="hint-label">{row._matchHint.label}</span>
								<HighlightText text={row._matchHint.text} {query} />
							</span>
						{:else}
							<span class="meta">{row._typeLabel}</span>
						{/if}
					</span>
					<span class="metrics">
						<span class="price num">{row._priceLabel}</span>
						<span
							class="pour num"
							class:up={row._pourTone === "up"}
							class:down={row._pourTone === "down"}
							class:loss={row._pourTone === "loss"}
							title={row._pourHint || undefined}
						>
							{row._pourLabel}
						</span>
					</span>
					<span class="live">
						<PublishStatusCell publish={row.publish} />
					</span>
				</button>
			{/if}
		{/each}
	</div>
</div>

<style>
	.list {
		display: flex;
		flex-direction: column;
		min-height: 0;
		flex: 1;
		height: 100%;
	}

	.sort {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
		padding: 0 0 0.65rem;
	}

	.sort-label {
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}

	.rows {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding-bottom: 0.75rem;
	}

	.group {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.85rem 0.15rem 0.4rem;
		background: color-mix(in srgb, var(--foreground) 3.5%, var(--background));
		border-bottom: 1px solid var(--border);
		position: sticky;
		top: 0;
		z-index: 1;
	}

	.chapter {
		margin: 0;
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--primary);
		line-height: 1.2;
	}

	.group-row {
		display: flex;
		align-items: baseline;
		gap: 0.65rem;
		min-width: 0;
	}

	h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 600;
		letter-spacing: -0.02em;
		color: var(--foreground);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.count {
		flex-shrink: 0;
		font-size: var(--text-xs);
		color: var(--muted-foreground);
	}

	.item {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 0.7rem;
		width: 100%;
		min-height: 3.35rem;
		margin: 0;
		padding: 0.55rem 0.15rem;
		border: 0;
		border-bottom: 1px solid var(--border);
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.item.on {
		background: var(--primary-wash);
	}

	.item:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: -2px;
	}

	.copy {
		display: flex;
		flex-direction: column;
		gap: 0.12rem;
		min-width: 0;
	}

	.name {
		font-weight: 500;
		line-height: 1.3;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.meta,
	.hint {
		font-size: var(--text-xs);
		color: var(--muted-foreground);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		line-height: 1.3;
	}

	.hint-label {
		margin-right: 0.4em;
		font-size: 0.65rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--subtle-foreground);
	}

	.metrics {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.1rem;
		flex-shrink: 0;
	}

	.price {
		font-size: var(--text);
		font-weight: 600;
	}

	.pour {
		font-size: var(--text-xs);
		color: var(--muted-foreground);
	}

	.live {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.25rem;
		flex-shrink: 0;
	}
</style>
