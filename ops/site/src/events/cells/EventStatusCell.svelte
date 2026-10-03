<script lang="ts">
	import Badge from "../../ui/Badge.svelte";

	let {
		label = "",
		tone = "",
	}: {
		label?: string;
		tone?: string;
	} = $props();
</script>

{#if label}
	<Badge {tone} {label} title={label} />
{/if}
