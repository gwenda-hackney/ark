<script lang="ts">
	/** A Badge as an AG Grid cell: `svelteCell(BadgeCell, (p) => ({ label, tone }))`. */
	import Badge from "./Badge.svelte";

	let {
		label = "",
		tone = "neutral",
		title,
	}: {
		label?: string;
		tone?: string;
		title?: string;
	} = $props();
</script>

{#if label}
	<Badge {tone} {label} title={title ?? label} />
{/if}
