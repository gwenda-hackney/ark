<script lang="ts">
	import { Button } from "../../ui";
	import { Icon } from "../../app/shell";
	import type { InventoryItem } from "../../app/types";

	let {
		item = null,
		onview,
	}: {
		item?: InventoryItem | null;
		onview: (item: InventoryItem) => void;
	} = $props();
</script>

{#if item}
	<Button
		variant="ghost"
		size="xs"
		type="button"
		aria-label="Open item"
		title="Open item"
		onclick={(e) => {
			e.stopPropagation();
			onview(item);
		}}
	>
		{#snippet icon()}
			<Icon name="chevron-right" size={16} />
		{/snippet}
	</Button>
{/if}
