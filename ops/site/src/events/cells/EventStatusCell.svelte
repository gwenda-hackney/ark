<script lang="ts">
	let {
		label = "",
		tone = "",
	}: {
		label?: string;
		tone?: string;
	} = $props();
</script>

{#if label}
	<span class="badge {tone}">{label}</span>
{/if}

<style>
	.badge {
		color: var(--muted-foreground);
		font-size: var(--text-sm);
		line-height: 1.3;
		white-space: nowrap;
	}

	.live {
		color: var(--primary);
	}

	.preview {
		color: var(--foreground);
	}

	.unpublished {
		color: var(--primary);
		font-weight: 600;
	}
</style>
