<script lang="ts">
	/**
	 * Recessed input against the card, gold ring on focus. Numbers get the
	 * mono face and lose the spinner so columns of figures line up.
	 */
	import type { HTMLInputAttributes } from "svelte/elements";

	let {
		value = $bindable(""),
		size = "md",
		mono = false,
		align = "start",
		type = "text",
		class: className = "",
		...rest
	}: Omit<HTMLInputAttributes, "size"> & {
		value?: string;
		size?: "md" | "sm";
		mono?: boolean;
		align?: "start" | "end";
	} = $props();

	const isFile = $derived(type === "file");
</script>

{#if isFile}
	<input
		class="input {size} {className}"
		type="file"
		{...rest}
	/>
{:else}
	<input
		class="input {size} {className}"
		class:mono
		class:end={align === "end"}
		{type}
		bind:value
		{...rest}
	/>
{/if}
<style>
	.input {
		display: block;
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		margin: 0;
		border: 1px solid var(--input);
		border-radius: var(--radius-md);
		background: var(--sunken);
		color: var(--foreground);
		line-height: 1.25;
		transition:
			border-color var(--t-fast) var(--ease-in-out),
			box-shadow var(--t-fast) var(--ease-in-out);
	}

	.md {
		height: var(--control-h);
		padding: 0 0.75rem;
		font-size: var(--text);
	}

	.sm {
		height: var(--control-h-sm);
		padding: 0 0.6875rem;
		font-size: var(--text);
	}

	.mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.end {
		text-align: right;
	}

	.input::placeholder {
		color: var(--subtle-foreground);
	}

	.input:hover:not(:disabled) {
		border-color: var(--border-strong);
	}

	.input:focus {
		outline: none;
		border-color: var(--ring);
		box-shadow: 0 0 0 3px var(--ring-wash);
	}

	.input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.input[type="number"] {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		appearance: textfield;
	}

	.input[type="number"]::-webkit-outer-spin-button,
	.input[type="number"]::-webkit-inner-spin-button {
		appearance: none;
		margin: 0;
	}

	.input[type="file"] {
		height: auto;
		min-height: var(--control-h-sm);
		padding: 0.4rem 0.65rem;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}

	.input[type="file"]::file-selector-button {
		margin-right: 0.65rem;
		padding: 0.25rem 0.65rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--foreground);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
	}
</style>
