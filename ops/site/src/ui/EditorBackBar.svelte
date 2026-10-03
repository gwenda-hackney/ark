<script lang="ts">
	/**
	 * Phone-only editor chrome: a labeled back control at the top of the
	 * overlay, in the place a list push would put it. Hidden on desktop.
	 */
	import { Icon } from "../app/shell";

	let {
		label,
		dirty = false,
		onback,
	}: {
		label: string;
		dirty?: boolean;
		onback: () => void;
	} = $props();
</script>

<header class="bar">
	<button type="button" class="back" onclick={onback}>
		<Icon name="chevron-left" size={22} strokeWidth={1.8} />
		<span>{label}</span>
	</button>
	{#if dirty}
		<span class="unsaved" aria-live="polite">Unsaved</span>
	{/if}
</header>

<style>
	.bar {
		display: none;
	}

	/* Keep in sync with SHELL_MOBILE_MAX_PX. */
	@media (max-width: 900px) {
		.bar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--space-3);
			flex-shrink: 0;
			min-height: 2.75rem;
			padding: max(0.2rem, env(safe-area-inset-top, 0px)) var(--page-gutter)
				0.2rem;
			border-bottom: 1px solid var(--border);
			background: var(--background);
			z-index: 4;
		}

		.back {
			display: inline-flex;
			align-items: center;
			gap: 0.1rem;
			min-height: 2.75rem;
			margin: 0 0 0 -0.55rem;
			padding: 0 0.55rem;
			border: 0;
			border-radius: var(--radius-md);
			background: none;
			color: var(--primary);
			font: inherit;
			font-size: var(--text-md);
			font-weight: 500;
			letter-spacing: var(--tracking-lg);
			cursor: pointer;
		}

		.back:focus-visible {
			outline: 2px solid var(--ring);
			outline-offset: 2px;
		}

		.unsaved {
			flex-shrink: 0;
			font-size: var(--text-sm);
			font-weight: 600;
			color: var(--destructive);
		}
	}
</style>
