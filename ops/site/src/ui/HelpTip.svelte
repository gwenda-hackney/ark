<script lang="ts">
	/**
	 * The quiet "?" beside a field or heading. Opens the editor's Help drawer
	 * on `topic` (see help.svelte.ts). Renders nothing without a Help drawer
	 * above it or when the drawer has no such topic.
	 */
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
		<!-- Wider ring than the shared help icon, so the ? has room inside it. -->
		<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
			<circle cx="12" cy="12" r="10" />
			<path d="M9.75 9.2c0-1.35 1.05-2.25 2.25-2.25s2.25.85 2.25 2.1c0 1.15-.85 1.7-1.55 2.15-.7.45-1.05.85-1.05 1.7" />
			<path d="M12 16.15h.01" />
		</svg>
	</button>
{/if}

<style>
	.help-tip {
		position: relative;
		display: inline-grid;
		place-content: center;
		flex-shrink: 0;
		width: 1.125rem;
		height: 1.125rem;
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

	.help-tip svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.75;
		stroke-linecap: round;
		stroke-linejoin: round;
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
