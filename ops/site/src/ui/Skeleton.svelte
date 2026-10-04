<script lang="ts">
	/**
	 * Placeholder rows while a list loads, shaped like the list that will
	 * replace them so nothing jumps when the data lands.
	 */
	let {
		rows = 6,
		thumb = false,
		lines = 2,
		label = "Loading…",
	}: {
		rows?: number;
		/** A square on the left, for lists with photos or avatars. */
		thumb?: boolean;
		/** Text lines per row: 1 or 2. */
		lines?: 1 | 2;
		/** Read to screen readers instead of the shapes. */
		label?: string;
	} = $props();

	/** Vary widths a little so it reads as text, not a barcode. */
	const widths = [62, 48, 70, 55, 66, 44, 58, 51];
</script>

<div class="skeleton" role="status" aria-live="polite">
	<span class="sr-only">{label}</span>
	{#each Array.from({ length: rows }) as _, index (index)}
		<div class="row" aria-hidden="true" class:two={lines === 2}>
			{#if thumb}<span class="skel thumb"></span>{/if}
			<span class="copy">
				<span class="skel line" style:width="{widths[index % widths.length]}%"></span>
				{#if lines === 2}
					<span class="skel line sub" style:width="{widths[(index + 3) % widths.length] - 14}%"></span>
				{/if}
			</span>
			<span class="skel end"></span>
		</div>
	{/each}
</div>

<style>
	.skeleton {
		display: grid;
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: 2.5rem;
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--border);
	}

	.row.two {
		min-height: 3.5rem;
	}

	.thumb {
		flex-shrink: 0;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: var(--radius-md);
	}

	.copy {
		display: grid;
		gap: var(--space-2);
		flex: 1;
		min-width: 0;
	}

	.line {
		height: 0.75rem;
	}

	.line.sub {
		height: 0.625rem;
		opacity: 0.7;
	}

	.end {
		flex-shrink: 0;
		width: 3.5rem;
		height: 0.75rem;
	}

	@media (max-width: 900px) {
		.end {
			display: none;
		}
	}
</style>
