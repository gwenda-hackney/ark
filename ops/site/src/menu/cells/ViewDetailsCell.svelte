<script lang="ts">
	import { Button } from "../../ui";
	import { Icon } from "../../app/shell";
	import type { MenuItem } from "../../app/types";

	let {
		item = null,
		onview,
	}: {
		item?: MenuItem | null;
		onview: (item: MenuItem) => void;
	} = $props();
</script>

{#if item}
	<Button
		variant="ghost"
		size="xs"
		type="button"
		aria-label="Open recipe"
		title="Open recipe"
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
