<script lang="ts">
	import Badge from "../../ui/Badge.svelte";
	import { posStatusBadge } from "../../ui/badge";
	import type { LightspeedStatus } from "../../inventory/types";

	let {
		status,
	}: {
		status?: LightspeedStatus | string;
	} = $props();

	const badge = $derived(posStatusBadge(status));
</script>

{#if badge}
	<Badge tone={badge.tone} label={badge.label} title={badge.label} />
{:else}
	<span class="none">—</span>
{/if}

<style>
	.none {
		color: var(--muted-foreground);
	}
</style>
