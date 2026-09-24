<script lang="ts">
	let {
		label = "",
	}: {
		label?: string;
	} = $props();

	const empty = $derived(!label);
</script>

<span class="mark" class:empty title={label || "None"}>
	{label || "None"}
</span>

<style>
	.mark {
		display: inline-block;
		font-size: var(--text-xs);
		color: var(--foreground);
		white-space: nowrap;
	}

	.mark.empty {
		color: var(--muted-foreground);
	}
</style>
