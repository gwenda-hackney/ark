<script lang="ts">
	import type { HTMLTextareaAttributes } from "svelte/elements";
	import { getFieldContext, joinIds } from "./field-context";

	let {
		value = $bindable(""),
		class: className = "",
		"aria-describedby": describedByProp,
		...rest
	}: HTMLTextareaAttributes & { value?: string } = $props();

	const field = getFieldContext();
	const describedBy = $derived(joinIds(describedByProp as string | undefined, field?.describedBy));
</script>

<textarea
	class="input {className}"
	class:invalid={field?.invalid}
	bind:value
	aria-describedby={describedBy}
	aria-invalid={field?.invalid || undefined}
	{...rest}
></textarea>

<style>
	.input {
		display: block;
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		margin: 0;
		min-height: 4.5rem;
		padding: var(--space-3) var(--space-3);
		border: 1px solid var(--input);
		border-radius: var(--radius-md);
		background: var(--sunken);
		color: var(--foreground);
		font-size: var(--text-base);
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

	.input.invalid {
		border-color: var(--danger);
	}
</style>
