<script lang="ts">
	import { Icon } from "../../app/shell";
	import {
		publishLiveLabel,
		publishNotLive,
		type ItemPublishState,
	} from "../../app/types";

	let {
		publish,
	}: {
		publish?: ItemPublishState;
	} = $props();

	const pending = $derived(publishNotLive(publish));
	const label = $derived(publishLiveLabel(publish));
</script>

{#if pending}
	<span class="mark" title={label} aria-label={label} role="img">
		<Icon name="alert" size={18} strokeWidth={2} />
	</span>
{/if}

<style>
	.mark {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		color: var(--down);
		line-height: 0;
	}

	.mark :global(svg) {
		display: block;
		flex-shrink: 0;
	}
</style>
