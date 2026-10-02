<script lang="ts">
	/** Unsaved edits: keep editing, or throw them away (on close or reload). */
	import { Button, Dialog } from "../../ui";

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

<Dialog {open} title="Discard unsaved changes?" onclose={oncancel}>
	<p class="delete-copy">
		{kind === "reload"
			? "Reload will discard unsaved changes."
			: "You have edits that have not been saved. Close without saving?"}
	</p>
	{#snippet footer()}
		<Button variant="outline" size="sm" type="button" onclick={oncancel}>
			Keep editing
		</Button>
		<Button variant="destructive" size="sm" type="button" onclick={onconfirm}>
			Discard
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
</style>
