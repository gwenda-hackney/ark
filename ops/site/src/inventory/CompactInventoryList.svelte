<script lang="ts">
	import { formatGbp } from "../app/money";
	import { INVENTORY_KINDS, type InventoryItem } from "./types";

	type GridRow = InventoryItem & { _id: string };

	let {
		rows,
		selectedId = null,
		onview,
	}: {
		rows: GridRow[];
		selectedId?: string | null;
		onview: (item: InventoryItem) => void;
	} = $props();

	function kindLabel(kind: string | undefined): string {
		return INVENTORY_KINDS.find((row) => row.value === kind)?.label || kind || "";
	}

	function costOf(row: GridRow): string {
		const priced = (row.suppliers || []).find((entry) => entry.price != null);
		return priced?.price != null ? formatGbp(priced.price) : "";
	}
</script>

<div class="rows scrollbar-fade">
	{#each rows as row (row._id)}
		<button
			type="button"
			class="item"
			class:on={row._id === selectedId}
			class:inactive={row.active === false}
			onclick={() => onview(row)}
		>
			<span class="copy">
				<span class="name">{row.name || "Untitled"}</span>
				<span class="meta">
					{kindLabel(row.kind)}
					{#if row.defaultUnit}
						<span class="dot">·</span>
						{row.defaultUnit}
					{/if}
					{#if row.actualQty != null}
						<span class="dot">·</span>
						{row.actualQty}{row.actualUnit ? ` ${row.actualUnit}` : ""}
					{/if}
					{#if row.active === false}
						<span class="dot">·</span>
						Inactive
					{/if}
				</span>
			</span>
			{#if costOf(row)}
				<span class="cost num">{costOf(row)}</span>
			{/if}
		</button>
	{/each}
</div>

<style>
	.rows {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding-bottom: var(--space-3);
	}

	.item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		width: 100%;
		min-height: 3.35rem;
		margin: 0;
		padding: var(--space-2) 0.1rem;
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

	.item.inactive {
		opacity: 0.62;
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
		font-size: var(--text-base);
		font-weight: 500;
		line-height: 1.3;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.meta {
		font-size: var(--text-sm);
		color: var(--muted-foreground);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.dot {
		margin: 0 0.15rem;
	}

	.cost {
		flex-shrink: 0;
		font-size: var(--text-base);
		font-weight: 500;
	}
</style>
