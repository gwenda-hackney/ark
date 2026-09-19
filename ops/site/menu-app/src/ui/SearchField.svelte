<script lang="ts">
	/** Pill search, straight from the reference: icon inset, no hard border. */
	let {
		value = $bindable(""),
		placeholder = "Search…",
		ariaLabel = "Search",
		count,
		width = "16rem",
	}: {
		value?: string;
		placeholder?: string;
		ariaLabel?: string;
		/** Result tally, shown once a query narrows the set. */
		count?: number;
		width?: string;
	} = $props();
</script>

<div class="wrap" style:--search-w={width}>
	<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
		<path
			d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4"
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
	<input type="search" bind:value {placeholder} aria-label={ariaLabel} />
	{#if value && count !== undefined}
		<span class="count num">{count}</span>
	{/if}
	{#if value}
		<button type="button" class="clear" aria-label="Clear search" onclick={() => (value = "")}>
			<svg viewBox="0 0 16 16" aria-hidden="true">
				<path
					d="m4.5 4.5 7 7m0-7-7 7"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
				/>
			</svg>
		</button>
	{/if}
</div>

<style>
	.wrap {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		height: var(--control-h);
		width: var(--search-w);
		max-width: 100%;
		padding: 0 0.5rem 0 0.875rem;
		border: 1px solid transparent;
		border-radius: var(--radius-pill);
		background: var(--sunken);
		transition:
			border-color var(--t-fast) var(--ease-in-out),
			box-shadow var(--t-fast) var(--ease-in-out),
			background-color var(--t-fast) var(--ease-in-out);
	}

	.wrap:hover {
		border-color: var(--border);
	}

	.wrap:focus-within {
		border-color: var(--ring);
		box-shadow: 0 0 0 3px var(--ring-wash);
	}

	.icon {
		width: 0.9375rem;
		height: 0.9375rem;
		color: var(--muted-foreground);
	}

	input {
		flex: 1;
		min-width: 0;
		height: 100%;
		border: none;
		background: none;
		font-size: var(--text);
		color: var(--foreground);
	}

	input:focus {
		outline: none;
	}

	input::placeholder {
		color: var(--subtle-foreground);
	}

	input::-webkit-search-cancel-button {
		appearance: none;
	}

	.count {
		flex-shrink: 0;
		font-size: var(--text-xs);
		color: var(--muted-foreground);
	}

	.clear {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.375rem;
		height: 1.375rem;
		flex-shrink: 0;
		border: none;
		border-radius: var(--radius-pill);
		background: none;
		color: var(--muted-foreground);
		transition:
			background-color var(--t-fast) var(--ease-in-out),
			color var(--t-fast) var(--ease-in-out);
	}

	.clear:hover {
		background: var(--accent);
		color: var(--foreground);
	}

	.clear svg {
		width: 0.75rem;
		height: 0.75rem;
	}
</style>
