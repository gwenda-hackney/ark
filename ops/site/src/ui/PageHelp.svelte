<script lang="ts">
	/**
	 * Help button for a page header. Opens a side drawer of control notes.
	 * Under an editor's `provideHelp` it opens that editor's drawer (the one
	 * its fields' "?" open) on every topic; otherwise it brings its own.
	 */
	import { Icon } from "../app/shell";
	import Button from "./Button.svelte";
	import HelpDrawer from "./HelpDrawer.svelte";
	import { getHelp } from "./help.svelte";
	import type { PageHelpTopic } from "./types";

	let {
		title = "Help",
		topics = [],
	}: {
		title?: string;
		topics?: PageHelpTopic[];
	} = $props();

	const help = getHelp();
	let localOpen = $state(false);
	const expanded = $derived(help ? help.open : localOpen);
</script>

<Button
	variant="ghost"
	size="sm"
	type="button"
	data-compact
	aria-expanded={expanded}
	aria-haspopup="dialog"
	onclick={() => (help ? help.show() : (localOpen = true))}
>
	{#snippet icon()}
		<Icon name="help" size={16} />
	{/snippet}
	Help
</Button>

{#if !help}
	<HelpDrawer open={localOpen} {title} {topics} onclose={() => (localOpen = false)} />
{/if}
