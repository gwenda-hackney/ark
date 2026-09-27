<script lang="ts">
	/**
	 * Help button for a page header. Opens a side drawer of control notes.
	 */
	import { Icon } from "../app/shell";
	import Button from "./Button.svelte";
	import HelpDrawer from "./HelpDrawer.svelte";
	import type { PageHelpTopic } from "./types";

	let {
		title = "Help",
		topics = [],
	}: {
		title?: string;
		topics?: PageHelpTopic[];
	} = $props();

	let open = $state(false);
</script>

<Button
	variant="ghost"
	size="sm"
	type="button"
	aria-expanded={open}
	aria-haspopup="dialog"
	onclick={() => (open = true)}
>
	{#snippet icon()}
		<Icon name="help" size={16} />
	{/snippet}
	Help
</Button>

<HelpDrawer {open} {title} {topics} onclose={() => (open = false)} />
