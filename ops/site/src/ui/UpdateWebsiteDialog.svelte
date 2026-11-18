<script lang="ts">
	/** Confirm putting something live on gwenda.co.uk: an event, a menu. */
	import ConfirmDialog from "./ConfirmDialog.svelte";

	let {
		open,
		putting,
		error = "",
		message = "This version of the event goes on gwenda.co.uk for everyone.",
		onclose,
		onconfirm,
	}: {
		open: boolean;
		putting: boolean;
		error?: string;
		/** What goes on the website. */
		message?: string;
		onclose: () => void;
		onconfirm: () => void;
	} = $props();
</script>

<ConfirmDialog
	{open}
	title="Update the website?"
	{message}
	action="Update website"
	tone="primary"
	busy={putting}
	busyLabel="Updating…"
	{error}
	oncancel={onclose}
	{onconfirm}
/>
