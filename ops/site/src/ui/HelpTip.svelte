<script lang="ts">
	/**
	 * The quiet "?" beside a field or heading. Opens the editor's Help drawer
	 * on `topic` (see help.svelte.ts). Renders nothing without a Help drawer
	 * above it or when the drawer has no such topic.
	 */
	import { Icon } from "../app/shell";
	import { getHelp } from "./help.svelte";

	let { label, topic }: { label: string; topic: string } = $props();

	const help = getHelp();
	const available = $derived(Boolean(help?.has(topic)));
	const current = $derived(Boolean(help?.open && help.focus === topic));
</script>

{#if help && available}
	<button
		type="button"
		class="help-tip"
		class:current
		aria-label="Help: {label}"
		aria-haspopup="dialog"
		aria-expanded={current}
		onclick={(e) => {
			e.preventDefault();
			e.stopPropagation();
			help.show(topic);
		}}
	>
		<Icon name="help" size={16} />
	</button>
{/if}

<style>
	.help-tip {
		position: relative;
		display: inline-grid;
		place-content: center;
		flex-shrink: 0;
		width: 1.25rem;
		height: 1.25rem;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--muted-foreground);
		font: inherit;
		line-height: 1;
		vertical-align: middle;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition: color var(--t-fast) var(--ease-in-out);
	}

	/* A finger-sized target without pushing the label row taller. */
	.help-tip::after {
		content: "";
		position: absolute;
		inset: -0.6rem;
	}

	.help-tip:hover,
	.help-tip.current {
		color: var(--primary);
	}

	.help-tip:focus-visible {
		color: var(--primary);
		outline: 2px solid var(--ring);
		outline-offset: 1px;
	}
</style>
