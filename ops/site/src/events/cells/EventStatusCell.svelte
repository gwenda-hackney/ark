<script lang="ts">
	import Badge from "../../ui/Badge.svelte";

	let {
		label = "",
		tone = "",
		title = "",
	}: {
		label?: string;
		tone?: string;
		/** The longer words; the badge shows the short label. */
		title?: string;
	} = $props();
</script>

{#if label}
	<Badge {tone} {label} title={title || label} />
{/if}
