<script lang="ts">
	/**
	 * Analysis issue count. Click opens the drink on the Analysis tab.
	 */
	import { hasRangeSelection } from "../../ui/grid";
	import { menuItemPath } from "../../app/nav";
	import type { MenuItem } from "../types";

	let {
		item = null,
		label = "—",
		tone = "",
		hint = "",
		onview,
	}: {
		item?: MenuItem | null;
		label?: string;
		tone?: "loss" | "down" | "";
		hint?: string;
		onview: (item: MenuItem, tab?: string) => void;
	} = $props();

	const href = $derived(
		item?.name?.trim() ? menuItemPath(item.name, "analysis") : "",
	);

	function onClick(event: MouseEvent) {
		if (hasRangeSelection()) {
			event.preventDefault();
			return;
		}
		if (!item) return;
		if (event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		event.stopPropagation();
		onview(item, "analysis");
	}
</script>

{#if item}
	{#if href}
		<a
			class="count"
			class:loss={tone === "loss"}
			class:down={tone === "down"}
			class:muted={!tone}
			{href}
			title={hint || "Open analysis"}
			aria-label={`Open analysis${label !== "—" ? `, ${label} issues` : ""}`}
			onclick={onClick}>{label}</a
		>
	{:else}
		<button
			class="count"
			class:loss={tone === "loss"}
			class:down={tone === "down"}
			class:muted={!tone}
			type="button"
			title={hint || "Open analysis"}
			aria-label={`Open analysis${label !== "—" ? `, ${label} issues` : ""}`}
			onclick={onClick}>{label}</button
		>
	{/if}
{/if}

<style>
	.count {
		display: block;
		width: 100%;
		margin: 0;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		text-align: right;
		text-decoration: none;
		line-height: 1.3;
		cursor: pointer;
		user-select: text;
	}

	.count.muted {
		color: var(--muted-foreground);
	}

	.count.down {
		color: var(--down);
	}

	.count.loss {
		color: var(--loss);
	}

	.count:hover {
		text-decoration: underline;
		text-underline-offset: 0.18em;
	}

	.count:focus-visible {
		outline: none;
	}
</style>
