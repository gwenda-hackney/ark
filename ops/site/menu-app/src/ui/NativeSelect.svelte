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
		display: block;
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		margin: 0;
		border: 1px solid var(--input);
		border-radius: var(--radius-md);
		background-color: var(--sunken);
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238a8680' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 0.65rem center;
		background-size: 0.9rem;
		color: var(--foreground);
		line-height: 1.25;
		appearance: none;
		transition:
			border-color var(--t-fast) var(--ease-in-out),
			box-shadow var(--t-fast) var(--ease-in-out);
	}

	.md {
		height: var(--control-h);
		padding: 0 2rem 0 0.75rem;
		font-size: 0.8125rem;
	}

	.sm {
		height: var(--control-h-sm);
		padding: 0 1.75rem 0 0.6875rem;
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

	.input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
