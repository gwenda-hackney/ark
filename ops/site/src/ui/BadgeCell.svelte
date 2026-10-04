<script lang="ts">
	/** A Badge as an AG Grid cell: `svelteCell(BadgeCell, (p) => ({ label, tone }))`. */
	import Badge from "./Badge.svelte";
	import { toBadgeTone } from "./badge";

	let {
		label = "",
		tone = "neutral",
		title,
		plainWhenNeutral = false,
	}: {
		label?: string;
		tone?: string;
		title?: string;
		/** Show the everyday state as plain text so the exceptions stand out. */
		plainWhenNeutral?: boolean;
	} = $props();
</script>

{#if label && plainWhenNeutral && toBadgeTone(tone) === "neutral"}
	<span class="plain">{label}</span>
{:else if label}
	<Badge {tone} {label} title={title ?? label} />
{/if}

<style>
	.plain {
		color: var(--fg-muted);
	}
</style>
