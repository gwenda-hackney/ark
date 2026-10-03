<script lang="ts">
	/** Confirm putting this event live on gwenda.co.uk. */
	import { ConfirmDialog } from "../../ui";

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

<ConfirmDialog
	{open}
	title="Update the website?"
	message="This version of the event goes on gwenda.co.uk for everyone."
	action="Update website"
	tone="primary"
	busy={putting}
	busyLabel="Updating…"
	{error}
	oncancel={onclose}
	{onconfirm}
/>
