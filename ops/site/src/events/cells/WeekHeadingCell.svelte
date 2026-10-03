<script lang="ts">
	let { label = "" }: { label?: string } = $props();
</script>

<h2>{label}</h2>

<style>
	h2 {
		margin: var(--space-3) 0 0;
		color: var(--primary);
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		line-height: 1.3;
		text-transform: uppercase;
	}
</style>
