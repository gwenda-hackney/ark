<script lang="ts">
	/** Unsaved edits: keep editing, or throw them away (on close or reload). */
	import { ConfirmDialog } from "../../ui";

	let {
		open,
		kind,
		oncancel,
		onconfirm,
	}: {
		open: boolean;
		kind: "close" | "reload";
		oncancel: () => void;
		onconfirm: () => void;
	} = $props();
</script>

<ConfirmDialog
	{open}
	title="Discard unsaved changes?"
	message={kind === "reload"
		? "Reloading puts back what was last saved. Your edits will be lost."
		: "You have edits that haven't been saved. They will be lost."}
	action="Discard"
	cancelLabel="Keep editing"
	{oncancel}
	{onconfirm}
/>
