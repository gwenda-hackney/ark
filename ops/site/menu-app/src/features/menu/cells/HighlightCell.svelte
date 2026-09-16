<script lang="ts">
	import HighlightText from "../../../ui/HighlightText.svelte";

	let {
		text = "",
		query = "",
	}: {
		text?: string;
		query?: string;
	} = $props();
</script>

<span class="cell"><HighlightText {text} {query} /></span>

<style>
	.cell {
		display: block;
		min-width: 0;
		width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: inherit;
	}
</style>
