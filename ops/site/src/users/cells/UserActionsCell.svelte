<script lang="ts">
	/** Users table: edit and delete, at the end of the row. */
	import RowAction from "../../ui/RowAction.svelte";

	let { email = "", busy = false, onedit, onremove }: { email?: string; busy?: boolean; onedit?: () => void; onremove?: () => void } = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<span class="actions" onclick={(event) => event.stopPropagation()}>
	<RowAction icon="pencil" label="Edit {email}" disabled={busy} reason="Saving…" onclick={() => onedit?.()} />
	<RowAction label="Delete {email}" disabled={busy} reason="Saving…" onclick={() => onremove?.()} />
</span>

<style>
	.actions {
		display: inline-flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-1);
		width: 100%;
		height: 100%;
	}
</style>
