<script lang="ts">
	import { Icon } from "../../app/shell";

	let {
		onremove,
		show = true,
	}: {
		onremove: () => void;
		show?: boolean;
	} = $props();
</script>

{#if show}
	<button
		type="button"
		class="remove"
		aria-label="Remove line"
		title="Remove line"
		onclick={(e) => {
			e.stopPropagation();
			onremove();
		}}
	>
		<Icon name="x-circle" size={18} strokeWidth={1.8} />
	</button>
{/if}

<style>
	.remove {
		display: inline-grid;
		place-content: center;
		width: 1.75rem;
		height: 1.75rem;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--destructive);
		cursor: pointer;
	}

	.remove:hover {
		background: var(--destructive-wash);
		color: color-mix(in srgb, var(--destructive) 85%, #e8e4dc);
	}

	.remove:focus-visible {
		outline: 2px solid var(--destructive);
		outline-offset: 2px;
	}
</style>
