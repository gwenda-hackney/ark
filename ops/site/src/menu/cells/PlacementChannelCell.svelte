<script lang="ts">
	/** AG Grid cell: where a placement goes (Print, Digital, POS · menu), flagged when it repeats a row above. */
	import Badge from "../../ui/Badge.svelte";

	let {
		label = "",
		repeat = false,
	}: {
		label?: string;
		repeat?: boolean;
	} = $props();
</script>

<span class="channel">
	<span class="label">{label}</span>
	{#if repeat}
		<Badge tone="warning" label="Repeat" title="Same as a row above. Save keeps one; change its location to keep both." />
	{/if}
</span>

<style>
	.channel {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}

	.label {
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
