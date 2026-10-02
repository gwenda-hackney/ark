<script lang="ts">
	import { posMenusLabel, type PosMenu } from "../types";

	let {
		menus = [],
	}: {
		menus?: PosMenu[];
	} = $props();

	const label = $derived(posMenusLabel(menus));
	const empty = $derived(!menus?.length);
</script>

<span class="mark" class:empty title={label}>
	{label}
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
