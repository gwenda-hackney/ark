<script lang="ts">
	/**
	 * Ingredient name cell: plain label plus discrete Edit / Inventory actions.
	 */
	import { hasRangeSelection } from "../../ui/grid";
	import { navigate } from "../../app/nav";
	import { Icon } from "../../app/shell";

	let {
		text = "",
		href = "",
		onedit,
	}: {
		text?: string;
		href?: string;
		onedit: () => void;
	} = $props();

	function edit(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		if (hasRangeSelection()) return;
		onedit();
	}

	function openStock(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		if (!href || hasRangeSelection()) return;
		if (event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			window.open(href, "_blank", "noopener");
			return;
		}
		navigate(href);
	}
</script>

<div class="cell">
	<span class="name" title={text || undefined}>{text || "Untitled"}</span>
	<div class="actions">
		<button
			type="button"
			class="action"
			title="Change ingredient"
			aria-label="Change ingredient"
			onclick={edit}
		>
			<Icon name="pen" size={13} />
		</button>
		{#if href}
			<button
				type="button"
				class="action"
				title="Open in inventory"
				aria-label="Open in inventory"
				onclick={openStock}
			>
				<Icon name="inventory" size={13} />
			</button>
		{/if}
	</div>
</div>

<style>
	.cell {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		width: 100%;
	}

	.name {
		min-width: 0;
		flex: 1 1 auto;
		font-weight: 500;
		line-height: 1.3;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.actions {
		display: inline-flex;
		align-items: center;
		gap: 0.1rem;
		flex: none;
	}

	.action {
		display: inline-grid;
		place-content: center;
		width: 1.5rem;
		height: 1.5rem;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--muted-foreground);
		cursor: pointer;
	}

	.action:hover {
		color: var(--primary);
		background: var(--accent);
	}
</style>
