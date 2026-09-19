<script lang="ts">
	/** Embed a legacy static HTML tool inside the ops shell. */
	import { BusyOverlay } from "../../ui";

	let { src, title }: { src: string; title: string } = $props();
	let ready = $state(false);
</script>

<div class="frame">
	<iframe
		{src}
		title={title}
		onload={() => (ready = true)}
	></iframe>
	<BusyOverlay active={!ready} label="Loading…" />
</div>

<style>
	.frame {
		position: relative;
		flex: 1;
		width: 100%;
		min-height: 0;
		background: #f4f4f2;
	}

	iframe {
		display: block;
		width: 100%;
		height: 100%;
		border: none;
		background: #f4f4f2;
	}
</style>
