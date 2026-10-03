<script lang="ts">
	import { Icon } from "../app/shell";
	import { Button, Dialog } from "../ui";
	import PourTargetsForm from "../config/PourTargetsForm.svelte";
	import { pourSettings } from "../config/settings.svelte";

	let { open = false, onclose }: { open?: boolean; onclose: () => void } =
		$props();

	let form = $state<ReturnType<typeof PourTargetsForm> | null>(null);
	let dirty = $state(false);

	async function saveAndClose() {
		if (await form?.save()) onclose();
	}
</script>

<Dialog {open} sheet title="Pour targets" {onclose}>
	<PourTargetsForm
		bind:this={form}
		bind:dirty
		active={open}
		idPrefix="dialog-pour"
		showReset={false}
		showActions={false}
	/>
	{#snippet footer()}
		<Button variant="outline" size="sm" type="button" onclick={onclose}>
			{#snippet icon()}<Icon name="close" size={14} />{/snippet}
			{dirty ? "Cancel" : "Close"}
		</Button>
		<Button
			variant="primary"
			size="sm"
			type="button"
			busy={pourSettings.saving}
			disabled={!dirty || pourSettings.saving}
			onclick={() => void saveAndClose()}
		>
			{#snippet icon()}<Icon name="save" size={14} />{/snippet}
			Save pour targets
		</Button>
	{/snippet}
</Dialog>
