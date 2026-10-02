<script lang="ts">
	import { highlightParts } from "./search";

	let {
		text = "",
		query = "",
	}: {
		text?: string;
		query?: string;
	} = $props();

	const parts = $derived(highlightParts(text, query));
</script>

{#each parts as part, i (i)}
	{#if part.hit}<mark>{part.text}</mark>{:else}{part.text}{/if}
{/each}

<style>
	mark {
		background: var(--primary-wash-strong);
		color: var(--primary);
		font-weight: 650;
		padding: 0.02em 0.12em;
		border-radius: 2px;
	}
</style>
