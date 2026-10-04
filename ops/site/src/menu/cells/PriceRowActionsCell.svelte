<script lang="ts">
	/** AG Grid cell on the price table: move the row up or down, or remove it. Shown on row hover. */
	import RowAction from "../../ui/RowAction.svelte";

	let {
		label,
		first,
		last,
		onmove,
		onremove,
	}: {
		label: string;
		first: boolean;
		last: boolean;
		onmove: (by: -1 | 1) => void;
		onremove: () => void;
	} = $props();
</script>

<span class="actions">
	<RowAction icon="chevron-up" tone="neutral" label={`Move ${label} up`} disabled={first} reason="Already first" onclick={() => onmove(-1)} />
	<RowAction icon="chevron-down" tone="neutral" label={`Move ${label} down`} disabled={last} reason="Already last" onclick={() => onmove(1)} />
	<RowAction label={`Remove ${label}`} disabled={first} reason="A drink needs one price" onclick={onremove} />
</span>

<style>
	.actions {
		display: inline-flex;
		align-items: center;
		gap: 0.125rem;
		height: 100%;
	}
</style>
