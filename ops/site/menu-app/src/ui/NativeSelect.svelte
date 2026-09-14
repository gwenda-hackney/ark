<script lang="ts">
	import type { HTMLSelectAttributes } from "svelte/elements";
	import type { SelectOption } from "./types";

	let {
		value = $bindable(""),
		options = [],
		size = "md",
		class: className = "",
		...rest
	}: HTMLSelectAttributes & {
		value?: string;
		options?: SelectOption[];
		size?: "md" | "sm";
	} = $props();
</script>

<select class="input {size} {className}" bind:value {...rest}>
	{#each options as opt (opt.value)}
		<option value={opt.value} disabled={opt.disabled}>{opt.label}</option>
	{/each}
</select>

<style>
	.input {
		width: 100%;
		min-width: 0;
		border: 1px solid var(--input);
		border-radius: var(--radius-md);
		background: var(--sunken);
		color: var(--foreground);
		transition:
			border-color var(--t-fast) var(--ease-in-out),
			box-shadow var(--t-fast) var(--ease-in-out);
	}

	.md {
		height: var(--control-h);
		padding: 0 0.75rem;
		font-size: 0.8125rem;
	}

	.sm {
		height: var(--control-h-sm);
		padding: 0 0.6875rem;
		font-size: 0.8125rem;
	}

	.input:hover:not(:disabled) {
		border-color: var(--border-strong);
	}

	.input:focus {
		outline: none;
		border-color: var(--ring);
		box-shadow: 0 0 0 3px var(--ring-wash);
	}
</style>
