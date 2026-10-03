<script lang="ts">
	let { label = "" }: { label?: string } = $props();
</script>

<h2>{label}</h2>

<style>
	/* Sits on the bottom of its row, next to the nights it heads. */
	h2 {
		display: flex;
		align-items: flex-end;
		height: 100%;
		margin: 0;
		padding-bottom: var(--space-2);
		color: var(--primary);
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		line-height: 1.3;
		text-transform: uppercase;
	}
</style>
