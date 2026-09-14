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
		class: className = "",
		...rest
	}: HTMLInputAttributes & {
		value?: string;
		size?: "md" | "sm";
		mono?: boolean;
		align?: "start" | "end";
	} = $props();
</script>

<input
	class="input {size} {className}"
	class:mono
	class:end={align === "end"}
	bind:value
	{...rest}
/>

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

	.input[type="date"] {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.input[type="date"]::-webkit-calendar-picker-indicator {
		opacity: 0.5;
		cursor: pointer;
		transition: opacity var(--t-fast) var(--ease-in-out);
	}

	.input[type="date"]:hover::-webkit-calendar-picker-indicator,
	.input[type="date"]:focus::-webkit-calendar-picker-indicator {
		opacity: 1;
	}
</style>
