<script lang="ts">
	import type { HTMLTextareaAttributes } from "svelte/elements";

	let {
		value = $bindable(""),
		class: className = "",
		...rest
	}: HTMLTextareaAttributes & { value?: string } = $props();
</script>

<textarea class="input {className}" bind:value {...rest}></textarea>

<style>
	.input {
		display: block;
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		margin: 0;
		min-height: 4.5rem;
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--input);
		border-radius: var(--radius-md);
		background: var(--sunken);
		color: var(--foreground);
		font-size: var(--text);
		line-height: 1.45;
		resize: vertical;
		transition:
			border-color var(--t-fast) var(--ease-in-out),
			box-shadow var(--t-fast) var(--ease-in-out);
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
</style>
