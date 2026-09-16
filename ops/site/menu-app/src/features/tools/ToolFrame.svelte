<script lang="ts">
	/** Embed a legacy static HTML tool inside the ops shell. */
	let { src, title }: { src: string; title: string } = $props();
</script>

<iframe class="frame" {src} title={title}></iframe>

<style>
	.frame {
		flex: 1;
		width: 100%;
		min-height: 0;
		border: none;
		background: #f4f4f2;
	}
</style>
