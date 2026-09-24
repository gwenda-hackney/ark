<script lang="ts">
	let { label = "" }: { label?: string } = $props();
</script>

<h2>{label}</h2>

<style>
	h2 {
		margin: 0.85rem 0 0;
		color: var(--primary);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		line-height: 1.3;
		text-transform: uppercase;
	}
</style>
