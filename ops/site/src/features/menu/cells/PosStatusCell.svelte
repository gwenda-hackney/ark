<script lang="ts">
	import {
		lightspeedStatusLabel,
		type LightspeedStatus,
	} from "../../../lib/types";

	let {
		status,
	}: {
		status?: LightspeedStatus | string;
	} = $props();

	const label = $derived(lightspeedStatusLabel(status) || "—");
	const tone = $derived(
		status === "matched" ? "ok" : status === "mismatch" || status === "missing" ? "warn" : "",
	);
</script>

<span class="mark" class:ok={tone === "ok"} class:warn={tone === "warn"} title={label}>
	{label}
</span>

<style>
	.mark {
		display: inline-block;
		font-size: var(--text-xs);
		color: var(--muted-foreground);
		white-space: nowrap;
	}

	.mark.ok {
		color: var(--foreground);
	}

	.mark.warn {
		color: var(--down, #c97a7a);
	}
</style>
