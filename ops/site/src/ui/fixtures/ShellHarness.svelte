<script lang="ts">
	import EditorShell from "../EditorShell.svelte";

	let { open = true, dirty = false, withTabs = true }: { open?: boolean; dirty?: boolean; withTabs?: boolean } = $props();
</script>

{#snippet kicker()}<p class="eyebrow">Menu</p>{/snippet}
{#snippet tabs()}<span>Items · Details</span>{/snippet}

<EditorShell
	{open}
	{dirty}
	help={false}
	backLabel="Menus"
	onclose={() => {}}
	{kicker}
	heading="Chez Pickle"
	subtitle="from 12 Nov · Wed–Sun"
	tabs={withTabs ? tabs : undefined}
	actions={{ saveLabel: "Save menu", dirty }}
>
	<p class="body">The map</p>
</EditorShell>
