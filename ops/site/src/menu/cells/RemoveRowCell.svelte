<script lang="ts">
	/** AG Grid cell: remove this line. The shared row button, named for the line. */
	import RowAction from "../../ui/RowAction.svelte";

	let {
		onremove,
		show = true,
		label = "Remove line",
	}: {
		onremove: () => void;
		show?: boolean;
		label?: string;
	} = $props();
</script>

{#if show}
	<RowAction {label} onclick={onremove} />
{/if}
