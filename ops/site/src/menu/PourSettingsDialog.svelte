<script lang="ts">
	import { Button, Dialog } from "../ui";
	import PourTargetsForm from "../config/PourTargetsForm.svelte";

	let { open = false, onclose }: { open?: boolean; onclose: () => void } =
		$props();
</script>

<Dialog {open} title="Pour targets" {onclose}>
	<PourTargetsForm
		active={open}
		idPrefix="dialog-pour"
		showReset={false}
	/>
	{#snippet footer()}
		<Button variant="primary" size="sm" type="button" onclick={onclose}>
			Done
		</Button>
	{/snippet}
</Dialog>
