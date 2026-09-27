<script lang="ts">
	/** Confirm putting this event live on gwenda.co.uk. */
	import { Button, Dialog } from "../../ui";

	let {
		open,
		putting,
		error,
		onclose,
		onconfirm,
	}: {
		open: boolean;
		putting: boolean;
		error: string;
		onclose: () => void;
		onconfirm: () => void;
	} = $props();
</script>

<Dialog
	{open}
	title="Update the website?"
	onclose={() => {
		if (!putting) onclose();
	}}
>
	<p class="delete-copy">This changes gwenda.co.uk for everyone.</p>
	{#if error}
		<p class="put-error">{error}</p>
	{/if}
	{#snippet footer()}
		<Button variant="outline" size="sm" type="button" disabled={putting} onclick={onclose}>
			Cancel
		</Button>
		<Button
			variant="primary"
			size="sm"
			type="button"
			busy={putting}
			disabled={putting}
			onclick={onconfirm}
		>
			Update website
		</Button>
	{/snippet}
</Dialog>

<style>
	.delete-copy {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.45;
		color: var(--foreground);
	}

	.put-error {
		margin: 0.75rem 0 0;
		color: var(--destructive);
	}
</style>
