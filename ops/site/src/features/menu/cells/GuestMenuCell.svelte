<script lang="ts">
	import { guestMenuLabel } from "../../../lib/types";

	let {
		placement,
	}: {
		placement?: string;
	} = $props();

	const label = $derived(guestMenuLabel(placement) || "Both");
	const quiet = $derived(placement === "both" || !placement);
</script>

<span class="mark" class:quiet title={label}>
	{label}
</span>

<style>
	.mark {
		display: inline-block;
		font-size: var(--text-xs);
		color: var(--foreground);
		white-space: nowrap;
	}

	.mark.quiet {
		color: var(--muted-foreground);
	}
</style>
